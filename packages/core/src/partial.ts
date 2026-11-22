import { z } from "zod";

import type { Config } from "./index.js";

export function schemasForConfigs<TSchema extends z.ZodType>(
  schema: TSchema,
  configs: Record<string, unknown>,
  build: (schema: TSchema, config: Config<z.infer<TSchema>>) => TSchema,
): Record<string, TSchema | undefined> {
  return Object.fromEntries(
    Object.entries(configs).map(([name, config]) => {
      try {
        return [name, build(schema, config as Config<z.infer<TSchema>>)];
      } catch {
        return [name, undefined];
      }
    }),
  );
}

export type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type PartialValidationResult = {
  valid: boolean;
  errors: z.ZodError | null;
};

type ConfigNode = boolean | { [key: string]: ConfigNode | undefined };

function unwrapOptional(schema: z.ZodType): z.ZodType {
  let current = schema;
  while (!(current instanceof z.ZodObject) && !(current instanceof z.ZodArray)) {
    if (
      current instanceof z.ZodOptional ||
      (current.safeParse(undefined).success && "unwrap" in current)
    ) {
      current = (current as unknown as z.ZodOptional<z.ZodType>).unwrap();
      continue;
    }
    return current;
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const lenientSchemaCache = new WeakMap<z.ZodType, z.ZodType>();

function rememberLenient(schema: z.ZodType, inner: z.ZodType, built: z.ZodType): void {
  lenientSchemaCache.set(schema, built);
  if (inner !== schema) lenientSchemaCache.set(inner, built);
}

function lenientSchema(schema: z.ZodType): z.ZodType {
  let produced: z.ZodType = schema;
  let stack: any[][] = [[schema, 0]];
  while (stack.length > 0) {
    let frame = stack[stack.length - 1] as any[];
    if (frame[1] === 0) {
      let cached = lenientSchemaCache.get(frame[0]);
      if (cached) {
        produced = cached;
        stack.pop();
        continue;
      }
      let inner = unwrapOptional(frame[0]);
      frame[2] = inner;
      if (inner instanceof z.ZodObject) {
        frame[1] = 1;
        frame[3] = Object.entries(inner.shape as Record<string, z.ZodType>);
        frame[4] = {};
        frame[5] = 0;
        continue;
      }
      if (inner instanceof z.ZodArray) {
        frame[1] = 2;
        stack.push([inner.element as z.ZodType, 0]);
        continue;
      }
      rememberLenient(frame[0], inner, inner);
      produced = inner;
      stack.pop();
      continue;
    }
    if (frame[1] === 2) {
      let built = z.array(produced);
      rememberLenient(frame[0], frame[2], built);
      produced = built;
      stack.pop();
      continue;
    }
    if (frame[6] !== undefined) {
      frame[4][frame[6]] = produced.optional();
      frame[6] = undefined;
    }
    let entries = frame[3] as [string, z.ZodType][];
    if (frame[5] >= entries.length) {
      let built = z.object(frame[4]);
      rememberLenient(frame[0], frame[2], built);
      produced = built;
      stack.pop();
      continue;
    }
    let entry = entries[frame[5]] as [string, z.ZodType];
    frame[5] += 1;
    frame[6] = entry[0];
    stack.push([entry[1], 0]);
  }
  return produced;
}

export function cacheLenientSchema(schema: z.ZodType): void {
  if (schema instanceof z.ZodObject || schema instanceof z.ZodArray) {
    lenientSchema(schema);
  }
}

function partialSchemaFor(
  schema: z.ZodType,
  config: ConfigNode | undefined,
  value: unknown,
): z.ZodType {
  let produced: z.ZodType = schema;
  let stack: any[][] = [[schema, config, value, 0]];
  while (stack.length > 0) {
    let frame = stack[stack.length - 1] as any[];
    if (frame[3] === 0) {
      let inner = unwrapOptional(frame[0]);
      frame[4] = inner;
      if (inner instanceof z.ZodObject && isRecord(frame[2])) {
        frame[3] = 1;
        frame[5] = isRecord(frame[1]) ? frame[1] : {};
        frame[6] = Object.entries(inner.shape as Record<string, z.ZodType>);
        frame[7] = {};
        frame[8] = 0;
        continue;
      }
      if (inner instanceof z.ZodArray && Array.isArray(frame[2])) {
        frame[3] = 2;
        frame[5] = isRecord(frame[1]) ? frame[1]["*"] : undefined;
        frame[8] = 0;
        frame[9] = [];
        continue;
      }
      produced = inner;
      stack.pop();
      continue;
    }
    if (frame[3] === 1) {
      if (frame[10] !== undefined) {
        frame[7][frame[10]] = frame[11] === false ? produced.optional() : produced;
        frame[10] = undefined;
      }
      let entries = frame[6] as [string, z.ZodType][];
      if (frame[8] >= entries.length) {
        produced = z.object(frame[7]);
        stack.pop();
        continue;
      }
      let entry = entries[frame[8]] as [string, z.ZodType];
      frame[8] += 1;
      let fieldKey = entry[0];
      let fieldSchema = entry[1];
      let fieldValue = (frame[2] as Record<string, unknown>)[fieldKey];
      if (fieldValue === undefined) {
        frame[7][fieldKey] = unwrapOptional(fieldSchema).optional();
        continue;
      }
      let fieldConfig = (frame[5] as Record<string, ConfigNode | undefined>)[fieldKey];
      frame[10] = fieldKey;
      frame[11] = fieldConfig;
      stack.push([fieldSchema, fieldConfig, fieldValue, 0]);
      continue;
    }
    if (frame[10] !== undefined) {
      (frame[9] as z.ZodType[]).push(produced);
      frame[10] = undefined;
    }
    let elements = frame[2] as unknown[];
    if (frame[8] >= elements.length) {
      produced = z.tuple(frame[9] as [z.ZodType, ...z.ZodType[]]);
      stack.pop();
      continue;
    }
    let element = elements[frame[8]];
    frame[8] += 1;
    frame[10] = true;
    stack.push([(frame[4] as z.ZodArray<z.ZodType>).element, frame[5], element, 0]);
  }
  return produced;
}

export function transformPartialSchema<
  TSchema extends z.ZodType,
  TConfig extends Config<DeepPartial<z.infer<TSchema>>>,
>(schema: TSchema, config: TConfig) {
  if (!(schema instanceof z.ZodObject) && !(schema instanceof z.ZodArray)) {
    throw new Error("The given schema must be a Zod object or array.");
  }
  return function forPartial(
    partial: DeepPartial<z.infer<TSchema>>,
  ): z.ZodType<DeepPartial<z.infer<TSchema>>> {
    return partialSchemaFor(schema, config as ConfigNode, partial) as z.ZodType<
      DeepPartial<z.infer<TSchema>>
    >;
  };
}

export function validatePartialAgainstConfigs<
  TSchema extends z.ZodType,
  TConfigs extends Record<string, Config<DeepPartial<z.infer<TSchema>>>>,
>(
  schema: TSchema,
  partial: DeepPartial<z.infer<TSchema>>,
  configs: TConfigs,
): { [K in keyof TConfigs]: PartialValidationResult } {
  if (!(schema instanceof z.ZodObject) && !(schema instanceof z.ZodArray)) {
    throw new Error("The given schema must be a Zod object or array.");
  }
  const parsed = lenientSchema(schema).safeParse(partial);
  return Object.fromEntries(
    Object.keys(configs).map((name) => [
      name,
      { valid: parsed.success, errors: parsed.success ? null : parsed.error },
    ]),
  ) as { [K in keyof TConfigs]: PartialValidationResult };
}

type ConditionalEntry<TData> =
  | boolean
  | ((data: TData) => boolean)
  | { requiredIf: (data: TData) => boolean };

export function makeStreamingConditionalTransformer<TData>(partial: TData) {
  return function streamingConditionalTransformer<TSchema extends z.ZodType>(
    schema: TSchema,
    config: Record<string, ConditionalEntry<TData> | Config<unknown>>,
  ) {
    const effectiveConfig = Object.fromEntries(
      Object.entries(config).map(([key, entry]) => {
        const condition =
          typeof entry === "function"
            ? entry
            : isRecord(entry) && typeof entry.requiredIf === "function"
              ? (entry.requiredIf as (data: TData) => boolean)
              : undefined;
        return [key, condition ? condition(partial) : entry];
      }),
    );
    const partialSchema = transformPartialSchema(
      schema,
      effectiveConfig as Config<DeepPartial<z.infer<TSchema>>>,
    )(partial as DeepPartial<z.infer<TSchema>>);
    return {
      schema: partialSchema,
      staticConfig: effectiveConfig,
      run: () => partialSchema.safeParse(partial),
    };
  };
}
