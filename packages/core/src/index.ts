import { z } from "zod";

/**
 * Whether this schema layer makes input optional (e.g. `ZodOptional`), i.e.
 * `undefined` parses successfully. Implemented with `safeParse(undefined)` —
 * not Zod's deprecated `schema.isOptional()` instance method.
 */
function isOptional(schema: z.ZodType): boolean {
  if (schema instanceof z.ZodObject || schema instanceof z.ZodArray) return false;
  if (schema instanceof z.ZodOptional) return true;
  return schema.safeParse(undefined).success;
}

/**
 * Type-safe configuration for `transformSchema` and conditional transformers.
 *
 * ## High-value use cases this type enables:
 * - Full autocomplete for every field path in your schema
 * - Compile-time errors for typos or non-existent fields
 * - Natural support for deeply nested objects
 * - Special `'*'` syntax for array element configuration
 * - `true` = make required, `false` = keep optional (or omit)
 *
 * @example
 * const config = {
 *   name: true,
 *   address: { city: true, country: false },
 *   tags: { '*': true },
 * } satisfies Config<z.infer<typeof mySchema>>;
 */
export type Config<T = unknown> =
  | boolean
  | (unknown extends T
      ? {
          [key: string]: Config<unknown> | undefined;
        } & {
          "*"?: Config<unknown>;
        }
      : T extends readonly (infer U)[]
        ? { "*"?: Config<U> }
        : T extends object
          ? { [K in keyof T]?: Config<T[K]> }
          : never);

/**
 * Make fields required/optional based on config.
 * Returns a properly typed Zod schema.
 */
export function transformSchema<
  TSchema extends z.ZodType,
  TConfig extends Config<z.infer<TSchema>>,
>(schema: TSchema, config: TConfig): TSchema {
  let produced: any;
  let stack: any[][] = [[0, schema, config]];
  while (stack.length > 0) {
    let frame = stack[stack.length - 1] as any[];
    let tag = frame[0];
    if (tag === 0) {
      let schemaNode = frame[1];
      let configNode = frame[2];
      if (
        !(schemaNode instanceof z.ZodObject) &&
        !(schemaNode instanceof z.ZodArray && configNode["*"])
      ) {
        throw new Error("The given schema must be a Zod object.");
      }
      if (schemaNode instanceof z.ZodArray && configNode["*"]) {
        frame[0] = 1;
        stack.push([0, schemaNode.element, configNode["*"]]);
        continue;
      }
      frame[0] = 2;
      stack.push([3, schemaNode, configNode]);
      continue;
    }
    if (tag === 1) {
      let elementSchema = frame[1].element;
      produced = z.array(
        z.object({
          ...elementSchema.shape,
          ...produced.shape,
        }),
      );
      stack.pop();
      continue;
    }
    if (tag === 2) {
      produced = z.object({
        ...frame[1].shape,
        ...produced.shape,
      });
      stack.pop();
      continue;
    }
    if (tag === 4) {
      produced = z.array(produced);
      stack.pop();
      continue;
    }
    if (frame[3] === undefined) {
      let schemaNode = frame[1];
      let configNode = frame[2];
      let unwrappedSchema = isOptional(schemaNode) ? schemaNode.unwrap() : schemaNode;
      frame[1] = unwrappedSchema;
      if (
        unwrappedSchema instanceof z.ZodObject &&
        typeof configNode === "object" &&
        !Array.isArray(configNode)
      ) {
        frame[3] = 1;
        frame[4] = Object.entries(unwrappedSchema.shape);
        frame[5] = {};
        frame[6] = 0;
        continue;
      }
      if (unwrappedSchema instanceof z.ZodArray && configNode["*"]) {
        frame[0] = 4;
        stack.push([3, unwrappedSchema.element, configNode["*"]]);
        continue;
      }
      produced = unwrappedSchema;
      stack.pop();
      continue;
    }
    if (frame[7] !== undefined) {
      frame[5][frame[7]] = produced;
      frame[7] = undefined;
    }
    let entries = frame[4] as [string, any][];
    if (frame[6] >= entries.length) {
      produced = z.object({
        ...frame[1].shape,
        ...frame[5],
      });
      stack.pop();
      continue;
    }
    let entry = entries[frame[6]] as [string, any];
    frame[6] += 1;
    let fieldKey = entry[0];
    let fieldSchema = entry[1];
    let fieldConfig = frame[2][fieldKey];
    if (fieldConfig === true || fieldConfig === false) {
      let unwrappedField = isOptional(fieldSchema) ? fieldSchema.unwrap() : fieldSchema;
      frame[5][fieldKey] =
        fieldConfig === true ? unwrappedField : unwrappedField.optional();
      continue;
    }
    if (typeof fieldConfig === "object") {
      frame[7] = fieldKey;
      stack.push([3, fieldSchema, fieldConfig]);
      continue;
    }
    frame[5][fieldKey] = fieldSchema;
  }
  return produced as TSchema;
}

export function makeConditionalSchemaTransformer(data: any) {
  return function conditionalSchemaTransformer(schema: z.ZodType, config: any) {
    let transformer = {
      run: () => schema.parse(data),
      schema: schema,
      staticConfig: {} as Record<string, any>,
    };
    if (
      schema instanceof z.ZodObject &&
      typeof config === "object" &&
      !Array.isArray(config)
    ) {
      const shape = schema.shape;
      const newShape = Object.fromEntries(
        Object.entries(shape).map(([key, value]: [string, any]) => {
          if (
            config[key] &&
            (config[key].requiredIf || typeof config[key] === "function")
          ) {
            const condition = config[key].requiredIf ?? config[key];
            if (typeof condition === "function" && condition(data)) {
              return [key, value.unwrap()];
            }
          } else if (config[key]) {
            transformer.staticConfig[key] = config[key];
          }
          return [key, value];
        }),
      );

      let updatedSchema = transformSchema(
        z.object(newShape),
        transformer.staticConfig,
      );

      transformer.run = () => updatedSchema.parse(data);
      transformer.schema = updatedSchema;
    }

    return transformer;
  };
}

export {
  transformPartialSchema,
  validatePartialAgainstConfigs,
  makeStreamingConditionalTransformer,
  type DeepPartial,
  type PartialValidationResult,
} from "./partial.js";
