import { z } from "zod";

import type { Config } from "./index.js";

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
  return schema.safeParse(undefined).success && "unwrap" in schema
    ? unwrapOptional((schema as unknown as z.ZodOptional<z.ZodType>).unwrap())
    : schema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function partialSchemaFor(
  schema: z.ZodType,
  config: ConfigNode | undefined,
  value: unknown,
): z.ZodType {
  const inner = unwrapOptional(schema);
  if (inner instanceof z.ZodObject && isRecord(value)) {
    const objectConfig = isRecord(config) ? config : {};
    const shape = Object.fromEntries(
      Object.entries(inner.shape as Record<string, z.ZodType>).map(
        ([key, fieldSchema]) => {
          if (value[key] === undefined) {
            return [key, unwrapOptional(fieldSchema).optional()];
          }
          const fieldConfig = objectConfig[key];
          const nested = partialSchemaFor(fieldSchema, fieldConfig, value[key]);
          return [key, fieldConfig === false ? nested.optional() : nested];
        },
      ),
    );
    return z.object(shape);
  }
  if (inner instanceof z.ZodArray && Array.isArray(value)) {
    const elementConfig = isRecord(config) ? config["*"] : undefined;
    const elements = value.map((element) =>
      partialSchemaFor(inner.element as z.ZodType, elementConfig, element),
    );
    return z.tuple(elements as [z.ZodType, ...z.ZodType[]]);
  }
  return inner;
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
  return Object.fromEntries(
    Object.entries(configs).map(([name, config]) => {
      const result = transformPartialSchema(
        schema,
        config,
      )(partial).safeParse(partial);
      return [
        name,
        { valid: result.success, errors: result.success ? null : result.error },
      ];
    }),
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
