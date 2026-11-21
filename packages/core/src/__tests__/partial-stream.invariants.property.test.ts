import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { z } from "zod";

import {
  transformPartialSchema,
  transformSchema,
  validatePartialAgainstConfigs,
} from "../";
import {
  createStreamValidator,
  parsePartialJson,
  validateStructuredOutput,
} from "../stream";

type LeafName = "string" | "number" | "boolean";

type SchemaNode =
  | { kind: "leaf"; leaf: LeafName }
  | { kind: "enum"; options: string[] }
  | { kind: "object"; fields: SchemaField[] }
  | { kind: "array"; element: SchemaNode };

type SchemaField = {
  fieldKey: string;
  optional: boolean;
  schemaNode: SchemaNode;
};

type GeneratedConfig =
  | boolean
  | { [key: string]: GeneratedConfig | undefined };

type ConfigRecord = Record<string, GeneratedConfig>;

type PathSegment = string | number;

const fieldKeyPool = ["alpha", "beta", "gamma", "delta"] as const;
const enumPool = ["red", "green", "blue", "gold"] as const;
const schemaDepth = fc.createDepthIdentifier();

const finiteNumber = fc.double({
  noNaN: true,
  noDefaultInfinity: true,
  min: -1e6,
  max: 1e6,
});

const schemaArbitraries = fc.letrec<{
  leaf: SchemaNode;
  enumeration: SchemaNode;
  object: SchemaNode;
  array: SchemaNode;
  schemaNode: SchemaNode;
  root: SchemaNode;
}>((tie) => ({
  leaf: fc
    .constantFrom<LeafName>("string", "number", "boolean")
    .map((leaf) => ({ kind: "leaf", leaf })),
  enumeration: fc
    .uniqueArray(fc.constantFrom(...enumPool), { minLength: 1, maxLength: 3 })
    .map((options) => ({ kind: "enum", options: [...options] })),
  object: fc
    .uniqueArray(
      fc.record({
        fieldKey: fc.constantFrom(...fieldKeyPool),
        optional: fc.boolean(),
        schemaNode: tie("schemaNode"),
      }),
      {
        minLength: 1,
        maxLength: 3,
        selector: (schemaField) => schemaField.fieldKey,
      },
    )
    .map((fields) => ({ kind: "object", fields })),
  array: tie("schemaNode").map((element) => ({ kind: "array", element })),
  schemaNode: fc.oneof(
    { maxDepth: 2, depthSize: "small", depthIdentifier: schemaDepth },
    tie("leaf"),
    tie("enumeration"),
    tie("object"),
    tie("array"),
  ),
  root: fc.oneof(tie("object"), tie("array")),
}));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function presentFieldsConform(schemaNode: SchemaNode, value: unknown): boolean {
  switch (schemaNode.kind) {
    case "leaf":
      switch (schemaNode.leaf) {
        case "string":
          return typeof value === "string";
        case "number":
          return typeof value === "number" && Number.isFinite(value);
        case "boolean":
          return typeof value === "boolean";
        default: {
          const unexpectedLeaf: never = schemaNode.leaf;
          throw new Error(String(unexpectedLeaf));
        }
      }
    case "enum":
      return (
        typeof value === "string" && schemaNode.options.includes(value)
      );
    case "object": {
      if (!isRecord(value)) return false;
      for (const schemaField of schemaNode.fields) {
        if (!Object.hasOwn(value, schemaField.fieldKey)) continue;
        const fieldValue = value[schemaField.fieldKey];
        if (fieldValue === undefined) continue;
        if (!presentFieldsConform(schemaField.schemaNode, fieldValue)) {
          return false;
        }
      }
      return true;
    }
    case "array": {
      if (!Array.isArray(value)) return false;
      return value.every((element) =>
        presentFieldsConform(schemaNode.element, element),
      );
    }
    default: {
      const unexpectedNode: never = schemaNode;
      throw new Error(String(unexpectedNode));
    }
  }
}

function zodFromNode(schemaNode: SchemaNode): z.ZodType {
  switch (schemaNode.kind) {
    case "leaf":
      switch (schemaNode.leaf) {
        case "string":
          return z.string();
        case "number":
          return z.number();
        case "boolean":
          return z.boolean();
        default: {
          const unexpectedLeaf: never = schemaNode.leaf;
          throw new Error(String(unexpectedLeaf));
        }
      }
    case "enum": {
      const [firstOption, ...restOptions] = schemaNode.options;
      if (firstOption === undefined) {
        throw new Error("Enum schema node needs an option");
      }
      return z.enum([firstOption, ...restOptions]);
    }
    case "object": {
      const shape: Record<string, z.ZodType> = {};
      for (const schemaField of schemaNode.fields) {
        const fieldSchema = zodFromNode(schemaField.schemaNode);
        shape[schemaField.fieldKey] = schemaField.optional
          ? fieldSchema.optional()
          : fieldSchema;
      }
      return z.object(shape);
    }
    case "array":
      return z.array(zodFromNode(schemaNode.element));
    default: {
      const unexpectedNode: never = schemaNode;
      throw new Error(String(unexpectedNode));
    }
  }
}

function leafValue(leaf: LeafName): fc.Arbitrary<unknown> {
  switch (leaf) {
    case "string":
      return fc.string({ maxLength: 8 });
    case "number":
      return finiteNumber;
    case "boolean":
      return fc.boolean();
    default: {
      const unexpectedLeaf: never = leaf;
      throw new Error(String(unexpectedLeaf));
    }
  }
}

function pickOption(options: string[]): fc.Arbitrary<string> {
  return fc
    .integer({ min: 0, max: Math.max(options.length - 1, 0) })
    .map((optionIndex) => options[optionIndex] ?? options[0] ?? "red");
}

function fullValue(schemaNode: SchemaNode): fc.Arbitrary<unknown> {
  switch (schemaNode.kind) {
    case "leaf":
      return leafValue(schemaNode.leaf);
    case "enum":
      return pickOption(schemaNode.options);
    case "object": {
      const fieldModel: Record<string, fc.Arbitrary<unknown>> = {};
      for (const schemaField of schemaNode.fields) {
        fieldModel[schemaField.fieldKey] = fullValue(schemaField.schemaNode);
      }
      return fc.record(fieldModel, { noNullPrototype: true });
    }
    case "array":
      return fc.array(fullValue(schemaNode.element), { maxLength: 2 });
    default: {
      const unexpectedNode: never = schemaNode;
      throw new Error(String(unexpectedNode));
    }
  }
}

function partialValueFor(schemaNode: SchemaNode): fc.Arbitrary<unknown> {
  if (schemaNode.kind === "object") {
    const fieldModel: Record<string, fc.Arbitrary<unknown>> = {};
    for (const schemaField of schemaNode.fields) {
      fieldModel[schemaField.fieldKey] = partialValueFor(schemaField.schemaNode);
    }
    return fc.record(fieldModel, {
      requiredKeys: [],
      noNullPrototype: true,
    });
  }
  if (schemaNode.kind === "array") {
    return fc.array(partialValueFor(schemaNode.element), { maxLength: 2 });
  }
  return fullValue(schemaNode);
}

function wrongValue(schemaNode: SchemaNode): fc.Arbitrary<unknown> {
  switch (schemaNode.kind) {
    case "leaf":
      switch (schemaNode.leaf) {
        case "string":
          return fc.oneof(
            finiteNumber,
            fc.boolean(),
            fc.constant(null),
            fc.constant({}),
            fc.array(fc.integer(), { maxLength: 1 }),
          );
        case "number":
          return fc.oneof(
            fc.string({ maxLength: 6 }),
            fc.boolean(),
            fc.constant(null),
            fc.constant({}),
            fc.constant(Number.NaN),
            fc.constant(Number.POSITIVE_INFINITY),
            fc.array(fc.integer(), { maxLength: 1 }),
          );
        case "boolean":
          return fc.oneof(
            fc.string({ maxLength: 6 }),
            finiteNumber,
            fc.constant(null),
            fc.constant({}),
            fc.array(fc.integer(), { maxLength: 1 }),
          );
        default: {
          const unexpectedLeaf: never = schemaNode.leaf;
          throw new Error(String(unexpectedLeaf));
        }
      }
    case "enum":
      return fc.oneof(
        fc.constant("nope"),
        finiteNumber,
        fc.boolean(),
        fc.constant(null),
        fc.constant({}),
      );
    case "object":
      return fc.oneof(
        fc.string({ maxLength: 6 }),
        finiteNumber,
        fc.boolean(),
        fc.constant(null),
        fc.array(fc.integer(), { maxLength: 1 }),
      );
    case "array":
      return fc.oneof(
        fc.string({ maxLength: 6 }),
        finiteNumber,
        fc.boolean(),
        fc.constant(null),
        fc.constant({}),
      );
    default: {
      const unexpectedNode: never = schemaNode;
      throw new Error(String(unexpectedNode));
    }
  }
}

function collectPresentPaths(
  schemaNode: SchemaNode,
  value: unknown,
  prefix: PathSegment[] = [],
): PathSegment[][] {
  const paths = [prefix];
  if (schemaNode.kind === "object" && isRecord(value)) {
    for (const schemaField of schemaNode.fields) {
      if (!Object.hasOwn(value, schemaField.fieldKey)) continue;
      const fieldValue = value[schemaField.fieldKey];
      if (fieldValue === undefined) continue;
      paths.push(
        ...collectPresentPaths(schemaField.schemaNode, fieldValue, [
          ...prefix,
          schemaField.fieldKey,
        ]),
      );
    }
  }
  if (schemaNode.kind === "array" && Array.isArray(value)) {
    for (const [elementIndex, element] of value.entries()) {
      paths.push(
        ...collectPresentPaths(schemaNode.element, element, [
          ...prefix,
          elementIndex,
        ]),
      );
    }
  }
  return paths;
}

function schemaNodeAt(schemaNode: SchemaNode, path: PathSegment[]): SchemaNode {
  let current = schemaNode;
  for (const segment of path) {
    if (current.kind === "object" && typeof segment === "string") {
      const schemaField = current.fields.find(
        (candidate) => candidate.fieldKey === segment,
      );
      if (schemaField === undefined) {
        throw new Error(`Missing field ${segment}`);
      }
      current = schemaField.schemaNode;
      continue;
    }
    if (current.kind === "array" && typeof segment === "number") {
      current = current.element;
      continue;
    }
    throw new Error(`Bad path segment ${String(segment)}`);
  }
  return current;
}

function replaceAtPath(
  value: unknown,
  path: PathSegment[],
  replacement: unknown,
): unknown {
  const [segment, ...rest] = path;
  if (segment === undefined) return replacement;
  if (Array.isArray(value) && typeof segment === "number") {
    const copy = value.slice();
    copy[segment] = replaceAtPath(value[segment], rest, replacement);
    return copy;
  }
  if (isRecord(value) && typeof segment === "string") {
    return {
      ...value,
      [segment]: replaceAtPath(value[segment], rest, replacement),
    };
  }
  return replacement;
}

function corruptedPartial(schemaNode: SchemaNode): fc.Arbitrary<unknown> {
  return partialValueFor(schemaNode).chain((partialValue) => {
    const paths = collectPresentPaths(schemaNode, partialValue);
    return fc
      .integer({ min: 0, max: paths.length - 1 })
      .chain((pathIndex) => {
        const path = paths[pathIndex] ?? [];
        return wrongValue(schemaNodeAt(schemaNode, path)).map((replacement) =>
          replaceAtPath(partialValue, path, replacement),
        );
      });
  });
}

function withExtraField(schemaNode: SchemaNode): fc.Arbitrary<unknown> {
  return partialValueFor(schemaNode).map((partialValue) => {
    if (!isRecord(partialValue)) return partialValue;
    return { ...partialValue, extraField: "ignored" };
  });
}

function configArbitrary(
  schemaNode: SchemaNode,
): fc.Arbitrary<GeneratedConfig | undefined> {
  if (schemaNode.kind === "object") {
    return fc.oneof(
      fc.constant(true),
      fc.constant(false),
      fc.constant(undefined),
      nestedObjectConfig(schemaNode),
    );
  }
  if (schemaNode.kind === "array") {
    return fc.oneof(
      fc.constant(true),
      fc.constant(false),
      fc.constant(undefined),
      configArbitrary(schemaNode.element).map((elementConfig) =>
        elementConfig === undefined ? {} : { "*": elementConfig },
      ),
    );
  }
  return fc.oneof(
    fc.constant(true),
    fc.constant(false),
    fc.constant(undefined),
  );
}

function nestedObjectConfig(
  schemaNode: Extract<SchemaNode, { kind: "object" }>,
): fc.Arbitrary<GeneratedConfig> {
  let configSoFar: fc.Arbitrary<Record<string, GeneratedConfig>> = fc.constant(
    {},
  );
  for (const schemaField of schemaNode.fields) {
    const fieldKey = schemaField.fieldKey;
    const fieldNode = schemaField.schemaNode;
    configSoFar = configSoFar.chain((builtConfig) =>
      configArbitrary(fieldNode).map((fieldConfig) => {
        if (fieldConfig === undefined) return builtConfig;
        return { ...builtConfig, [fieldKey]: fieldConfig };
      }),
    );
  }
  return configSoFar;
}

function namedConfigs(schemaNode: SchemaNode): fc.Arbitrary<ConfigRecord> {
  return fc
    .tuple(configArbitrary(schemaNode), configArbitrary(schemaNode))
    .map(([primary, secondary]) => ({
      primary: primary ?? {},
      secondary: secondary ?? true,
    }));
}

function partialCaseArbitrary(): fc.Arbitrary<
  [SchemaNode, ConfigRecord, unknown]
> {
  return schemaArbitraries.root.chain((schemaNode) =>
    fc.tuple(
      fc.constant(schemaNode),
      namedConfigs(schemaNode),
      fc.oneof(
        { weight: 4, arbitrary: partialValueFor(schemaNode) },
        { weight: 3, arbitrary: corruptedPartial(schemaNode) },
        { weight: 2, arbitrary: wrongValue(schemaNode) },
        { weight: 1, arbitrary: withExtraField(schemaNode) },
      ),
    ),
  );
}

function mismatch(
  label: string,
  configName: string,
  conforms: boolean,
  valid: boolean | undefined,
  schemaNode: SchemaNode,
  partialValue: unknown,
  configEntry: GeneratedConfig,
): Error {
  return new Error(
    `${label} ${configName}: valid=${String(valid)} presentFieldsConform=${conforms} config=${JSON.stringify(configEntry)} schema=${JSON.stringify(schemaNode)} partial=${JSON.stringify(partialValue)}`,
  );
}

function expectPresentFieldDecision(
  zodSchema: z.ZodType,
  configRecord: ConfigRecord,
  partialValue: unknown,
  schemaNode: SchemaNode,
): void {
  const conforms = presentFieldsConform(schemaNode, partialValue);
  for (const [configName, configEntry] of Object.entries(configRecord)) {
    const accepted = transformPartialSchema(
      zodSchema,
      configEntry,
    )(partialValue).safeParse(partialValue).success;
    if (accepted !== conforms) {
      throw mismatch(
        "I1 transformPartialSchema",
        configName,
        conforms,
        accepted,
        schemaNode,
        partialValue,
        configEntry,
      );
    }
  }
  const validated = validatePartialAgainstConfigs(
    zodSchema,
    partialValue,
    configRecord,
  );
  const streamed = createStreamValidator(zodSchema, configRecord).partial(
    partialValue,
  );
  for (const [configName, configEntry] of Object.entries(configRecord)) {
    const validatedResult = validated[configName];
    const streamedResult = streamed[configName];
    if (validatedResult?.valid !== conforms) {
      throw mismatch(
        "I1 validatePartialAgainstConfigs",
        configName,
        conforms,
        validatedResult?.valid,
        schemaNode,
        partialValue,
        configEntry,
      );
    }
    if (streamedResult?.valid !== conforms) {
      throw mismatch(
        "I1 createStreamValidator.partial",
        configName,
        conforms,
        streamedResult?.valid,
        schemaNode,
        partialValue,
        configEntry,
      );
    }
  }
}

type StreamModel = {
  schemaNode: SchemaNode;
  text: string;
};

type StreamReal = {
  text: string;
  zodSchema: z.ZodType;
  configRecord: ConfigRecord;
};

class AppendStreamChunk implements fc.Command<StreamModel, StreamReal> {
  constructor(private readonly chunk: string) {}

  check(model: Readonly<StreamModel>): boolean {
    return model.text.length < 10_000;
  }

  run(model: StreamModel, real: StreamReal): void {
    model.text += this.chunk;
    real.text += this.chunk;
    const partialValue = parsePartialJson(real.text);
    if (partialValue === undefined) return;
    expectPresentFieldDecision(
      real.zodSchema,
      real.configRecord,
      partialValue,
      model.schemaNode,
    );
  }

  toString(): string {
    return `append(${JSON.stringify(this.chunk)})`;
  }
}

function streamCommands(text: string): AppendStreamChunk[] {
  const commands: AppendStreamChunk[] = [];
  const chunkSize = 8;
  for (let cursor = 0; cursor < text.length; cursor += chunkSize) {
    commands.push(new AppendStreamChunk(text.slice(cursor, cursor + chunkSize)));
  }
  return commands;
}

function expectFinalAgrees(
  zodSchema: z.ZodType,
  configRecord: ConfigRecord,
  text: string,
): void {
  const parsed: unknown = JSON.parse(text);
  const finalResults = createStreamValidator(zodSchema, configRecord).final(
    parsed,
  );
  const structured = validateStructuredOutput(
    { final: parsed },
    zodSchema,
    configRecord,
  );
  for (const [configName, configEntry] of Object.entries(configRecord)) {
    const reference = transformSchema(zodSchema, configEntry).safeParse(parsed);
    const finalResult = finalResults[configName];
    if (
      finalResult === undefined ||
      finalResult.valid !== reference.success ||
      (finalResult.errors === null) !== reference.success
    ) {
      throw new Error(
        `I2 final ${configName}: valid=${String(finalResult?.valid)} safeParse=${reference.success} config=${JSON.stringify(configEntry)} text=${text}`,
      );
    }
    if (parsed === null) {
      if (structured.final !== null) {
        throw new Error(
          "validateStructuredOutput treated a null final as a payload",
        );
      }
      continue;
    }
    const structuredResult = structured.final?.[configName];
    if (
      structuredResult === undefined ||
      structuredResult.valid !== reference.success ||
      (structuredResult.errors === null) !== reference.success
    ) {
      throw new Error(
        `I2 validateStructuredOutput ${configName}: valid=${String(structuredResult?.valid)} safeParse=${reference.success} config=${JSON.stringify(configEntry)} text=${text}`,
      );
    }
  }
}

describe("partial and stream invariants", () => {
  it("I1 rejects an invalid present field and accepts when every present field conforms", () => {
    fc.assert(
      fc.property(
        partialCaseArbitrary(),
        ([schemaNode, configRecord, partialValue]) => {
          expectPresentFieldDecision(
            zodFromNode(schemaNode),
            configRecord,
            partialValue,
            schemaNode,
          );
        },
      ),
      { numRuns: 80 },
    );
  }, 15_000);

  it("I1 holds on every parsed prefix of a streamed partial", () => {
    fc.assert(
      fc.property(
        partialCaseArbitrary(),
        ([schemaNode, configRecord, partialValue]) => {
          const text = JSON.stringify(partialValue);
          const zodSchema = zodFromNode(schemaNode);
          fc.modelRun(
            () => ({
              model: { schemaNode, text: "" },
              real: { text: "", zodSchema, configRecord },
            }),
            streamCommands(text),
          );
          const completed = parsePartialJson(text);
          if (completed === undefined) {
            throw new Error(`complete JSON did not parse: ${text}`);
          }
          expect(completed).toEqual(JSON.parse(text));
        },
      ),
      { numRuns: 40 },
    );
  }, 15_000);

  it("I2 final agrees with transformSchema safeParse per config", () => {
    fc.assert(
      fc.property(
        schemaArbitraries.object.chain((schemaNode) =>
          fc.tuple(
            fc.constant(schemaNode),
            namedConfigs(schemaNode),
            fc.oneof(fc.jsonValue({ maxDepth: 2 }), fullValue(schemaNode)),
          ),
        ),
        ([schemaNode, configRecord, payload]) => {
          const text = JSON.stringify(payload);
          expectFinalAgrees(zodFromNode(schemaNode), configRecord, text);
        },
      ),
      { numRuns: 60 },
    );
  }, 15_000);
});
