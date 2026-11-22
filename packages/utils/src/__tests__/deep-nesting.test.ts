import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { z } from "zod";

import { dereferenceLocalDocument } from "../dereference-local.js";
import { openAPISchemaToZod, zodToOpenAPISchema } from "../openapi.js";

const deepLevelCount = 100_000;
const schemaDepth = fc.createDepthIdentifier();

function oracleOpenAPISchemaToZod(
  schema: any,
  propertyKey = "",
  required: string[] = [],
): z.ZodType {
  if (!schema || typeof schema !== "object") return z.any();
  const unionTypeList = Array.isArray(schema.type) ? schema.type : [];
  const numeric =
    unionTypeList.includes("number") || unionTypeList.includes("integer");
  const isNullable =
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes("null"));
  let zodSchema: z.ZodType;
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    const enumValues = schema.enum;
    zodSchema = enumValues.every((enumValue: unknown) => typeof enumValue === "string")
      ? z.enum(enumValues as [string, ...string[]])
      : z.union(
          enumValues.map((enumValue: unknown) =>
            z.literal(enumValue as string | number | boolean),
          ) as [z.ZodType, ...z.ZodType[]],
        );
  } else if (
    schema.type === "string" ||
    (Array.isArray(schema.type) && schema.type.includes("string"))
  ) {
    let stringSchema: z.ZodType = z.string();
    if (schema.format === "email") stringSchema = z.email();
    else if (schema.format === "uuid") stringSchema = z.uuid();
    else if (schema.format === "uri" || schema.format === "url") stringSchema = z.url();
    else if (schema.format === "date-time" || schema.format === "datetime") {
      stringSchema = z.iso.datetime();
    } else if (schema.format === "date") stringSchema = z.iso.date();
    else if (schema.format === "time") stringSchema = z.iso.time();
    let stringWithChecks = stringSchema as z.ZodString;
    if (typeof schema.minLength === "number") stringWithChecks = stringWithChecks.min(schema.minLength);
    if (typeof schema.maxLength === "number") stringWithChecks = stringWithChecks.max(schema.maxLength);
    if (typeof schema.pattern === "string") {
      try {
        stringWithChecks = stringWithChecks.regex(new RegExp(schema.pattern));
      } catch {
        void schema.pattern;
      }
    }
    zodSchema = stringWithChecks;
  } else if (
    schema.type === "number" ||
    schema.type === "integer" ||
    (unionTypeList.length > 0 && numeric)
  ) {
    let numberSchema: z.ZodNumber = z.number();
    if (schema.type === "integer" || (Array.isArray(schema.type) && schema.type.includes("integer"))) {
      numberSchema = numberSchema.int();
    }
    if (typeof schema.minimum === "number") numberSchema = numberSchema.min(schema.minimum);
    if (typeof schema.maximum === "number") numberSchema = numberSchema.max(schema.maximum);
    if (typeof schema.exclusiveMinimum === "number") {
      numberSchema = numberSchema.refine(
        (numericValue) => numericValue > schema.exclusiveMinimum,
        `Must be greater than ${schema.exclusiveMinimum}`,
      );
    }
    if (typeof schema.exclusiveMaximum === "number") {
      numberSchema = numberSchema.refine(
        (numericValue) => numericValue < schema.exclusiveMaximum,
        `Must be less than ${schema.exclusiveMaximum}`,
      );
    }
    if (typeof schema.multipleOf === "number") {
      numberSchema = numberSchema.refine(
        (numericValue) => numericValue % schema.multipleOf === 0,
        `Must be a multiple of ${schema.multipleOf}`,
      );
    }
    zodSchema = numberSchema;
  } else if (schema.type === "boolean") {
    zodSchema = z.boolean();
  } else if (schema.type === "array") {
    const itemSchema = schema.items
      ? oracleOpenAPISchemaToZod(schema.items, propertyKey, required)
      : z.any();
    let arraySchema = z.array(itemSchema);
    if (typeof schema.minItems === "number") arraySchema = arraySchema.min(schema.minItems);
    if (typeof schema.maxItems === "number") arraySchema = arraySchema.max(schema.maxItems);
    zodSchema = arraySchema;
  } else if (schema.type === "object" || ("properties" in schema && schema.properties)) {
    const properties = schema.properties || {};
    const requiredProperties: string[] = schema.required || [];
    const shape: Record<string, z.ZodType> = {};
    for (const [key, value] of Object.entries(properties)) {
      let propertySchema = oracleOpenAPISchemaToZod(value, key, requiredProperties);
      if (!requiredProperties.includes(key)) propertySchema = propertySchema.optional();
      shape[key] = propertySchema;
    }
    zodSchema = z.object(shape);
    if (schema.additionalProperties === false) {
      void shape;
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      void schema.additionalProperties;
    }
  } else if (schema.allOf && Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    let combined = oracleOpenAPISchemaToZod(schema.allOf[0]);
    for (let index = 1; index < schema.allOf.length; index += 1) {
      combined = combined.and(oracleOpenAPISchemaToZod(schema.allOf[index]));
    }
    zodSchema = combined;
  } else if (
    (schema.anyOf && Array.isArray(schema.anyOf)) ||
    (schema.oneOf && Array.isArray(schema.oneOf))
  ) {
    const variants = (schema.anyOf || schema.oneOf).map((part: any) => oracleOpenAPISchemaToZod(part));
    zodSchema = z.union(variants as [z.ZodType, ...z.ZodType[]]);
  } else {
    zodSchema = z.any();
  }
  if (isNullable) zodSchema = zodSchema.nullable();
  const shouldBeRequired = required.includes(propertyKey);
  if (!shouldBeRequired && propertyKey !== "") {
    if (
      !(
        zodSchema instanceof z.ZodObject ||
        zodSchema instanceof z.ZodArray ||
        zodSchema instanceof z.ZodUnion
      )
    ) {
      zodSchema = zodSchema.optional();
    }
  }
  return zodSchema;
}

const jsonSchema = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.record({ type: fc.constant("string") }),
    fc.record({ type: fc.constant("number") }),
    fc.record({ type: fc.constant("integer") }),
    fc.record({ type: fc.constant("boolean") }),
    fc.record({
      type: fc.constant("string"),
      enum: fc.constant(["red", "green"]),
    }),
  ),
  array: fc.record({
    type: fc.constant("array"),
    items: tie("node"),
  }),
  object: fc.record({
    type: fc.constant("object"),
    properties: fc
      .uniqueArray(fc.constantFrom("alpha", "beta", "gamma"), { maxLength: 3 })
      .chain((keys) =>
        fc.tuple(...keys.map(() => tie("node") as fc.Arbitrary<any>)).map((children) => {
          const properties: Record<string, unknown> = {};
          keys.forEach((key, index) => {
            properties[key] = children[index];
          });
          return properties;
        }),
      ),
    required: fc.uniqueArray(fc.constantFrom("alpha", "beta", "gamma"), { maxLength: 3 }),
  }),
  union: fc.record({
    anyOf: fc.array(tie("leaf") as fc.Arbitrary<any>, { minLength: 2, maxLength: 2 }),
  }),
  node: fc.oneof(
    { maxDepth: 3, depthSize: "small", depthIdentifier: schemaDepth },
    tie("leaf"),
    tie("array"),
    tie("object"),
    tie("union"),
  ),
})).node;

const probes = [undefined, null, 0, 1, "", "a", true, false, [], {}, { alpha: "a" }, { alpha: 1 }];

function nestedZod(depth: number): z.ZodType {
  let schema: z.ZodType = z.string();
  for (let level = 0; level < depth; level += 1) {
    schema = z.object({ nested: schema });
  }
  return schema;
}

function readZodNested(schema: z.ZodType, depth: number): z.ZodType {
  let current = schema;
  for (let level = 0; level < depth; level += 1) {
    if (current instanceof z.ZodOptional) current = current.unwrap() as z.ZodType;
    current = (current as z.ZodObject<any>).shape.nested as z.ZodType;
  }
  return current;
}

function readOpenApiNested(document: any, depth: number): unknown {
  let current = document;
  for (let level = 0; level < depth; level += 1) {
    current = current.properties.nested;
  }
  return current;
}

describe("openapi and dereference recursion elimination", () => {
  it("matches the recursive OpenAPI conversion on ordinary depth", () => {
    fc.assert(
      fc.property(jsonSchema, (schema) => {
        const actual = openAPISchemaToZod(schema);
        const expected = oracleOpenAPISchemaToZod(schema);
        expect(zodToOpenAPISchema(actual)).toEqual(zodToOpenAPISchema(expected));
        for (const probe of probes) {
          expect(actual.safeParse(probe).success).toBe(expected.safeParse(probe).success);
        }
      }),
      { numRuns: 40 },
    );
  });

  it("matches a recursive Zod to OpenAPI walk on ordinary depth", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.boolean(), (depth, optionalLeaf) => {
        let schema: z.ZodType = optionalLeaf ? z.string().optional() : z.string();
        for (let level = 0; level < depth; level += 1) {
          schema = z.object({ nested: schema, note: z.number().optional() });
        }
        const actual = zodToOpenAPISchema(schema);
        let expected: Record<string, unknown> = { type: "string" };
        for (let level = 0; level < depth; level += 1) {
          const required = level === 0 && optionalLeaf ? [] : ["nested"];
          const layer: Record<string, unknown> = {
            type: "object",
            properties: { nested: expected, note: { type: "number" } },
          };
          if (required.length > 0) layer.required = required;
          expected = layer;
        }
        expect(actual).toEqual(expected);
      }),
      { numRuns: 20 },
    );
  });

  it("converts an OpenAPI schema one hundred thousand levels deep", () => {
    let node: Record<string, unknown> = { type: "string" };
    for (let level = 0; level < deepLevelCount; level += 1) {
      node = {
        type: "object",
        required: ["nested"],
        properties: { nested: node },
      };
    }
    const zodSchema = openAPISchemaToZod(node);
    expect(readZodNested(zodSchema, deepLevelCount)).toBeInstanceOf(z.ZodString);
  }, 180_000);

  it("converts a Zod schema one hundred thousand levels deep", () => {
    const openApi = zodToOpenAPISchema(nestedZod(deepLevelCount));
    expect(readOpenApiNested(openApi, deepLevelCount)).toEqual({ type: "string" });
  }, 180_000);

  it("dereferences a document one hundred thousand levels deep", () => {
    let document: Record<string, unknown> = { type: "string" };
    for (let level = 0; level < deepLevelCount; level += 1) {
      document = { next: document };
    }
    const dereferenced = dereferenceLocalDocument(document) as { next?: unknown; type?: string };
    let cursor: any = dereferenced;
    for (let level = 0; level < deepLevelCount; level += 1) cursor = cursor.next;
    expect(cursor).toEqual({ type: "string" });

    let chain: Record<string, unknown> = { end: { type: "string" } };
    chain.start = { $ref: "#/link0" };
    for (let linkIndex = 0; linkIndex < 2_000; linkIndex += 1) {
      const nextPointer = linkIndex === 1_999 ? "#/end" : `#/link${linkIndex + 1}`;
      chain[`link${linkIndex}`] = { $ref: nextPointer };
    }
    expect(() => dereferenceLocalDocument(chain)).toThrow(RangeError);
    expect(() => dereferenceLocalDocument(chain)).toThrow(/Maximum dereference depth \(500\)/);
  }, 180_000);

  it("resolves one ref at each of one hundred thousand levels", () => {
    let document: Record<string, unknown> = { end: { type: "string" } };
    let cursor = document;
    for (let level = 0; level < deepLevelCount; level += 1) {
      let next: Record<string, unknown> = { marker: { $ref: "#/end" } };
      cursor.next = next;
      cursor = next;
    }
    let startedAt = performance.now();
    let dereferenced = dereferenceLocalDocument(document) as {
      end: { type: string };
      next: { marker: unknown; next?: unknown };
    };
    expect(performance.now() - startedAt).toBeLessThan(3_000);
    expect(dereferenced.next.marker).toBe(dereferenced.end);
    let leaf = dereferenced.next;
    for (let level = 0; level < deepLevelCount - 1; level += 1) {
      leaf = leaf.next as typeof leaf;
    }
    expect(leaf.marker).toBe(dereferenced.end);
    expect(leaf.next).toBeUndefined();
  }, 15_000);

  it("merges a sibling chain fifty thousand levels deep", () => {
    const siblingChainDepth = 50_000;
    let resolvedChild: Record<string, unknown> = { type: "string" };
    let siblingChild: Record<string, unknown> = { description: "g" };
    for (let level = 0; level < siblingChainDepth; level += 1) {
      resolvedChild = { child: resolvedChild };
      siblingChild = { child: siblingChild };
    }
    let document = {
      Node: { child: resolvedChild },
      Tree: { $ref: "#/Node", child: siblingChild },
    };
    let startedAt = performance.now();
    let dereferenced = dereferenceLocalDocument(document) as {
      Tree: { child: { child: unknown } };
    };
    expect(performance.now() - startedAt).toBeLessThan(1_500);
    let leaf: Record<string, unknown> = dereferenced.Tree;
    for (let level = 0; level < siblingChainDepth + 1; level += 1) {
      leaf = leaf.child as Record<string, unknown>;
    }
    expect(leaf).toEqual({ type: "string", description: "g" });
  }, 15_000);
});
