import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { z } from "zod";

import { transformSchema } from "../";
import {
  cacheLenientSchema,
  transformPartialSchema,
  validatePartialAgainstConfigs,
} from "../partial.js";
import { parsePartialJson, reparseFeed } from "../stream.js";
import { createPartialJsonFeed } from "../stream-incremental.js";

const deepLevelCount = 100_000;
const realisticSchemaDepth = 1_000;

function isOptionalSchema(schema: z.ZodType): boolean {
  return schema.safeParse(undefined).success;
}

function oracleExtend(partialSchema: z.ZodType, partialConfig: any): z.ZodType {
  const unwrappedPartialSchema = isOptionalSchema(partialSchema)
    ? (partialSchema as any).unwrap()
    : partialSchema;
  if (
    unwrappedPartialSchema instanceof z.ZodObject &&
    typeof partialConfig === "object" &&
    !Array.isArray(partialConfig)
  ) {
    const shape = unwrappedPartialSchema.shape;
    const newShape = Object.fromEntries(
      Object.entries(shape).map(([key, value]) => {
        const fieldSchema = value as z.ZodType;
        const unwrappedValue = isOptionalSchema(fieldSchema)
          ? (fieldSchema as any).unwrap()
          : fieldSchema;
        if (partialConfig[key] === true) return [key, unwrappedValue];
        if (partialConfig[key] === false) return [key, unwrappedValue.optional()];
        if (typeof partialConfig[key] === "object") {
          return [key, oracleExtend(fieldSchema, partialConfig[key])];
        }
        return [key, fieldSchema];
      }),
    );
    return z.object({ ...shape, ...newShape });
  }
  if (unwrappedPartialSchema instanceof z.ZodArray && partialConfig["*"]) {
    return z.array(
      oracleExtend(unwrappedPartialSchema.element as z.ZodType, partialConfig["*"]),
    );
  }
  return unwrappedPartialSchema;
}

function oracleTransform(schema: z.ZodType, config: any): z.ZodType {
  if (
    !(schema instanceof z.ZodObject) &&
    !(schema instanceof z.ZodArray && config["*"])
  ) {
    throw new Error("The given schema must be a Zod object.");
  }
  if (schema instanceof z.ZodArray && config["*"]) {
    const transformedElement = oracleTransform(schema.element as z.ZodType, config["*"]);
    return z.array(
      z.object({
        ...(schema.element as z.ZodObject<any>).shape,
        ...(transformedElement as z.ZodObject<any>).shape,
      }),
    );
  }
  const objectSchema = schema as z.ZodObject<any>;
  return z.object({
    ...objectSchema.shape,
    ...(oracleExtend(objectSchema, config) as z.ZodObject<any>).shape,
  });
}

function oracleUnwrap(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodObject || schema instanceof z.ZodArray) return schema;
  return schema.safeParse(undefined).success && "unwrap" in schema
    ? oracleUnwrap((schema as unknown as z.ZodOptional<z.ZodType>).unwrap())
    : schema;
}

function oraclePartial(
  schema: z.ZodType,
  config: unknown,
  value: unknown,
): z.ZodType {
  const inner = oracleUnwrap(schema);
  if (inner instanceof z.ZodObject && value !== null && typeof value === "object" && !Array.isArray(value)) {
    const objectConfig =
      config !== null && typeof config === "object" && !Array.isArray(config)
        ? (config as Record<string, unknown>)
        : {};
    const record = value as Record<string, unknown>;
    const shape = Object.fromEntries(
      Object.entries(inner.shape as Record<string, z.ZodType>).map(([key, fieldSchema]) => {
        if (record[key] === undefined) return [key, oracleUnwrap(fieldSchema).optional()];
        const fieldConfig = objectConfig[key];
        const nested = oraclePartial(fieldSchema, fieldConfig, record[key]);
        return [key, fieldConfig === false ? nested.optional() : nested];
      }),
    );
    return z.object(shape);
  }
  if (inner instanceof z.ZodArray && Array.isArray(value)) {
    const elementConfig =
      config !== null && typeof config === "object" && !Array.isArray(config)
        ? (config as Record<string, unknown>)["*"]
        : undefined;
    const elements = value.map((element) =>
      oraclePartial(inner.element as z.ZodType, elementConfig, element),
    );
    return z.tuple(elements as [z.ZodType, ...z.ZodType[]]);
  }
  return inner;
}

function oracleLenient(schema: z.ZodType): z.ZodType {
  const inner = oracleUnwrap(schema);
  if (inner instanceof z.ZodObject) {
    const shape = Object.fromEntries(
      Object.entries(inner.shape as Record<string, z.ZodType>).map(([fieldKey, fieldSchema]) => [
        fieldKey,
        oracleLenient(fieldSchema).optional(),
      ]),
    );
    return z.object(shape);
  }
  if (inner instanceof z.ZodArray) return z.array(oracleLenient(inner.element as z.ZodType));
  return inner;
}

function expectSameParse(left: z.ZodType, right: z.ZodType, value: unknown): void {
  const leftResult = left.safeParse(value);
  const rightResult = right.safeParse(value);
  expect(leftResult.success).toBe(rightResult.success);
  if (leftResult.success && rightResult.success) {
    expect(leftResult.data).toEqual(rightResult.data);
  }
}

function nestedField(schema: z.ZodType, depth: number, fieldKey: string): z.ZodType {
  let current = schema;
  for (let level = 0; level < depth; level += 1) {
    if (current instanceof z.ZodOptional) current = current.unwrap() as z.ZodType;
    current = (current as z.ZodObject<any>).shape[fieldKey] as z.ZodType;
  }
  return current;
}

function nestedValue(value: unknown, depth: number, fieldKey: string): unknown {
  let current = value;
  for (let level = 0; level < depth; level += 1) {
    current = (current as Record<string, unknown>)[fieldKey];
  }
  return current;
}

const fieldNames = ["alpha", "beta", "gamma"] as const;
const schemaDepth = fc.createDepthIdentifier();

const schemaNode = fc.letrec((tie) => ({
  leaf: fc.constantFrom("string", "number", "boolean").map((kind) => {
    if (kind === "string") return z.string();
    if (kind === "number") return z.number();
    return z.boolean();
  }),
  object: fc
    .uniqueArray(
      fc.record({
        fieldKey: fc.constantFrom(...fieldNames),
        optional: fc.boolean(),
        child: tie("node") as fc.Arbitrary<z.ZodType>,
      }),
      { minLength: 1, maxLength: 3, selector: (entry) => entry.fieldKey },
    )
    .map((fields) => {
      const shape: Record<string, z.ZodType> = {};
      for (const field of fields) {
        shape[field.fieldKey] = field.optional ? field.child.optional() : field.child;
      }
      return z.object(shape);
    }),
  array: (tie("object") as fc.Arbitrary<z.ZodObject>).map((element) => z.array(element)),
  node: fc.oneof(
    { maxDepth: 3, depthSize: "small", depthIdentifier: schemaDepth },
    tie("leaf"),
    tie("object"),
    tie("array"),
  ) as fc.Arbitrary<z.ZodType>,
}));

function configFor(schema: z.ZodType): fc.Arbitrary<unknown> {
  const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema;
  if (inner instanceof z.ZodObject) {
    const keys = Object.keys(inner.shape);
    return fc
      .tuple(
        ...keys.map((key) =>
          fc.oneof(
            fc.constant(true),
            fc.constant(false),
            fc.constant(undefined),
            configFor(inner.shape[key] as z.ZodType),
          ),
        ),
      )
      .map((choices) => {
        const config: Record<string, unknown> = {};
        choices.forEach((choice, index) => {
          const key = keys[index] as string;
          if (choice !== undefined) config[key] = choice;
        });
        return config;
      });
  }
  if (inner instanceof z.ZodArray) {
    return configFor(inner.element as z.ZodType).map((elementConfig) => ({ "*": elementConfig }));
  }
  return fc.constant(true);
}

function valueFor(schema: z.ZodType, drop: boolean): fc.Arbitrary<unknown> {
  const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema;
  if (inner instanceof z.ZodObject) {
    const keys = Object.keys(inner.shape);
    return fc
      .tuple(
        ...keys.map((key) =>
          fc.tuple(
            fc.boolean(),
            valueFor(inner.shape[key] as z.ZodType, drop),
            fc.constantFrom("keep", "number", "text", "flag", "skip"),
          ),
        ),
      )
      .map((entries) => {
        const record: Record<string, unknown> = {};
        entries.forEach((entry, index) => {
          const key = keys[index] as string;
          const [keep, nested, marker] = entry;
          if (drop && !keep) return;
          if (marker === "number") record[key] = 1;
          else if (marker === "text") record[key] = "x";
          else if (marker === "flag") record[key] = true;
          else if (marker === "skip") return;
          else record[key] = nested;
        });
        return record;
      });
  }
  if (inner instanceof z.ZodArray) {
    return fc.array(valueFor(inner.element as z.ZodType, drop), { maxLength: 2 });
  }
  if (inner instanceof z.ZodNumber) return fc.integer({ min: -5, max: 5 });
  if (inner instanceof z.ZodBoolean) return fc.boolean();
  return fc.string({ maxLength: 4 });
}

describe("recursion elimination", () => {
  it("matches the recursive schema transform on ordinary depth", () => {
    fc.assert(
      fc.property(
        schemaNode.object as fc.Arbitrary<z.ZodObject>,
        fc.boolean(),
        (schema, useArrayRoot) => {
          const rooted = useArrayRoot ? z.array(schema) : schema;
          fc.assert(
            fc.property(configFor(rooted), valueFor(rooted, true), (config, value) => {
              let actual: z.ZodType | undefined;
              let expected: z.ZodType | undefined;
              let actualError: Error | undefined;
              let expectedError: Error | undefined;
              try {
                actual = transformSchema(rooted, config as never);
              } catch (error) {
                actualError = error as Error;
              }
              try {
                expected = oracleTransform(rooted, config);
              } catch (error) {
                expectedError = error as Error;
              }
              expect(actualError?.message).toBe(expectedError?.message);
              if (!actual || !expected) return;
              expectSameParse(actual, expected, value);
              expectSameParse(actual, expected, {});
            }),
            { numRuns: 8 },
          );
        },
      ),
      { numRuns: 12 },
    );
  });

  it("matches the recursive partial schema on ordinary depth", () => {
    fc.assert(
      fc.property(
        schemaNode.object as fc.Arbitrary<z.ZodObject>,
        (schema) => {
          fc.assert(
            fc.property(configFor(schema), valueFor(schema, true), (config, value) => {
              const actual = transformPartialSchema(schema, config as never)(value as never);
              const expected = oraclePartial(schema, config, value);
              expectSameParse(actual, expected, value);
              const lenient = validatePartialAgainstConfigs(schema, value as never, { card: true });
              expect(lenient.card.valid).toBe(oracleLenient(schema).safeParse(value).success);
            }),
            { numRuns: 8 },
          );
        },
      ),
      { numRuns: 12 },
    );
  });

  it("walks a schema one thousand levels deep", () => {
    let schema: z.ZodType = z.object({ leaf: z.string() });
    let config: Record<string, unknown> = { leaf: true };
    let value: unknown = { leaf: "Pas" };
    for (let level = 0; level < realisticSchemaDepth; level += 1) {
      schema = z.object({ nested: schema });
      config = { nested: config };
      value = { nested: value };
    }
    const transformed = transformSchema(schema as z.ZodObject<any>, config as never);
    const partialSchema = transformPartialSchema(
      schema as z.ZodObject<any>,
      config as never,
    )(value as never);
    expect(
      (nestedField(transformed, realisticSchemaDepth, "nested") as z.ZodObject<any>).shape.leaf,
    ).toBeInstanceOf(z.ZodString);
    expect(
      (nestedField(partialSchema, realisticSchemaDepth, "nested") as z.ZodObject<any>).shape.leaf,
    ).toBeInstanceOf(z.ZodString);
    let lenientSchema: z.ZodType = z.string();
    for (let level = 0; level < realisticSchemaDepth; level += 1) {
      lenientSchema = z.object({ nested: lenientSchema });
    }
    expect(() => cacheLenientSchema(lenientSchema)).not.toThrow();
  });

  it("reads streamed JSON one hundred thousand levels deep", () => {
    let text = "";
    for (let level = 0; level < deepLevelCount; level += 1) text += '{"a":';
    text += "1";
    for (let level = 0; level < deepLevelCount; level += 1) text += "}";

    const feed = createPartialJsonFeed();
    let streamed: unknown;
    const chunkSize = 16_384;
    for (let index = 0; index < text.length; index += chunkSize) {
      streamed = feed(text.slice(index, index + chunkSize));
    }
    expect(nestedValue(streamed, deepLevelCount, "a")).toBe(1);

    const reparsedFeed = reparseFeed();
    let reparsed: unknown;
    const wideChunk = 20_000;
    for (let index = 0; index < text.length; index += wideChunk) {
      reparsed = reparsedFeed(text.slice(index, index + wideChunk));
    }
    expect(nestedValue(reparsed, deepLevelCount, "a")).toBe(1);
    expect(nestedValue(parsePartialJson(text), deepLevelCount, "a")).toBe(1);
    expect(nestedValue(parsePartialJson(text.slice(0, -1)), deepLevelCount, "a")).toBe(1);
  }, 180_000);
});
