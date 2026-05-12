import { z } from 'zod';

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
  | (T extends readonly (infer U)[]
      ? { '*'?: Config<U> }
      : T extends object
        ? { [K in keyof T]?: Config<T[K]> }
        : never);

/**
 * Make fields required/optional based on config.
 * Returns a properly typed Zod schema.
 */
export function transformSchema<
  TSchema extends z.ZodTypeAny,
  TConfig extends Config<z.infer<TSchema>>
>(
  schema: TSchema,
  config: TConfig
): TSchema {
  // Runtime implementation (existing logic)
  function extendSchema(
    partialSchema: z.ZodObject<any>,
    partialConfig: any
  ): z.ZodObject<any> {
    const unwrappedPartialSchema = partialSchema?.isOptional?.()
      ? (partialSchema as any).unwrap()
      : partialSchema;

    if (
      unwrappedPartialSchema instanceof z.ZodObject &&
      typeof partialConfig === 'object' &&
      !Array.isArray(partialConfig)
    ) {
      const shape = unwrappedPartialSchema.shape;
      const newShape = Object.fromEntries(
        Object.entries(shape).map(([key, value]: [string, any]) => {
          let unwrappedValue = value?.isOptional?.() ? value.unwrap() : value;
          if (partialConfig[key] === true) {
            return [key, unwrappedValue];
          } else if (partialConfig[key] === false) {
            return [key, unwrappedValue.optional()];
          } else if (typeof partialConfig[key] === 'object') {
            return [key, extendSchema(value, partialConfig[key])];
          }
          return [key, value];
        })
      );

      let updatedPartialSchema = z.object(newShape);

      return z.object({
        ...unwrappedPartialSchema.shape,
        ...updatedPartialSchema.shape,
      });
    }

    if (unwrappedPartialSchema instanceof z.ZodArray && partialConfig['*']) {
      const elementSchema = unwrappedPartialSchema.element as z.ZodObject<any>;
      let updatedPartialSchema = z.array(
        extendSchema(elementSchema, partialConfig['*'])
      );
      return updatedPartialSchema as any;
    }
    return unwrappedPartialSchema;
  }

  let updatedSchema: z.ZodType = schema;

  if (schema instanceof z.ZodArray && (config as any)['*']) {
    let transformedElement = transformSchema(schema.element, (config as any)['*']);
    updatedSchema = z.array(
      z.object({
        ...(schema.element as z.ZodObject<any>).shape,
        ...(transformedElement as z.ZodObject<any>).shape,
      })
    );
  } else if (schema instanceof z.ZodObject) {
    let extended = extendSchema(schema, config);
    updatedSchema = z.object({
      ...schema.shape,
      ...extended.shape,
    });
  }

  return updatedSchema as TSchema;
}

export function makeConditionalSchemaTransformer(data: any) {
  return function conditionalSchemaTransformer(
    schema: z.ZodType,
    config: any
  ) {
    let transformer = {
      run: () => schema.parse(data),
      schema: schema,
      staticConfig: {} as Record<string, any>,
    };
    if (
      schema instanceof z.ZodObject &&
      typeof config === 'object' &&
      !Array.isArray(config)
    ) {
      const shape = schema.shape;
      const newShape = Object.fromEntries(
        Object.entries(shape).map(([key, value]: [string, any]) => {
          if (
            config[key] &&
            (config[key].requiredIf || typeof config[key] === 'function')
          ) {
            const condition = config[key].requiredIf ?? config[key];
            if (typeof condition === 'function' && condition(data)) {
              return [key, value.unwrap()];
            }
          } else if (config[key]) {
            transformer.staticConfig[key] = config[key];
          }
          return [key, value];
        })
      );

      let updatedSchema = transformSchema(
        z.object(newShape),
        transformer.staticConfig
      );

      transformer.run = () => updatedSchema.parse(data);
      transformer.schema = updatedSchema;
    }

    return transformer;
  };
}
