import { z, ZodObject, ZodArray, ZodTypeAny } from 'zod';

export type Config = Record<string, any>;

/**
 * Make the given Zod schema required as per the configuration.
 * @param schema - The Zod schema to make required.
 * @param config - The configuration object.
 * @returns The updated Zod schema with required properties.
 * @throws If the given schema is not a Zod object.
 * @example
 * const schema = z.object({
 *   name: z.string().optional(),
 *   age: z.number().optional(),
 *     address: z.object({
 *       street: z.string().optional(),
 *       city: z.string().optional(),
 *     }).optional(),
 * });
 *
 * // Specify which properties are required, false will not make required
 * // In original schema optional properties yet
 * const config = {
 *   name: true,
 *    address: {
 *      city: true
 *   }
 * };
 * const updatedSchema = transformSchema(schema, config);
 * const validData = {
 *   name: 'John Doe',
 *   address: { city: 'New York' },
 * };
 * const invalidDataMissingName = {
 *   address: { city: 'New York' },
 * };
 * const invalidDataMissingCity = {
 *   name: 'John Doe',
 *   address: {},
 * };
 * schema.parse(validData); // Should pass
 * schema.parse(invalidDataMissingName); // Should fail due to missing 'name'
 * schema.parse(invalidDataMissingCity); // Should fail due to missing 'address.city'
 * @category Helper
 * @module transformSchema
 * */
// @ts-ignore
export function transformSchema(
  schema: ZodTypeAny,
  config: Config
): ZodTypeAny {
  function extendSchema(
    partialSchema: ZodObject<any>,
    partialConfig: Config
  ): ZodObject<any> {
    const unwrappedPartialSchema = partialSchema?.isOptional?.()
      ? // @ts-ignore
        partialSchema.unwrap()
      : partialSchema;

    if (
      unwrappedPartialSchema instanceof ZodObject &&
      typeof partialConfig === 'object' &&
      !Array.isArray(partialConfig)
    ) {
      const shape = unwrappedPartialSchema.shape;
      // @ts-ignore
      const newShape = Object.fromEntries(
        // @ts-ignore
        Object.entries(shape).map(([key, value]) => {
          // @ts-ignore
          let unwrappedValue = value?.isOptional?.() ? value.unwrap() : value;
          if (partialConfig[key] === true) {
            // @ts-ignore
            return [key, unwrappedValue];
          } else if (typeof partialConfig[key] === 'object') {
            // @ts-ignore
            return [key, extendSchema(value, partialConfig[key])];
          }
          return [key, value];
        })
      );

      let updatedPartialSchema = z.object(newShape);

      // @ts-ignore
      return unwrappedPartialSchema.merge(updatedPartialSchema);
    }

    if (unwrappedPartialSchema instanceof ZodArray && partialConfig['*']) {
      const elementSchema = unwrappedPartialSchema.element as ZodObject<any>;

      let updatedPartialSchema = z.array(
        extendSchema(elementSchema, partialConfig['*'])
      );

      // @ts-ignore
      return updatedPartialSchema;
    }
    return unwrappedPartialSchema;
  }

  let updatedSchema = schema;

  if (schema instanceof ZodArray && config['*']) {
    // @ts-ignore
    updatedSchema = transformSchema(schema.element, config['*']);
    updatedSchema = z.array(schema.element.merge(updatedSchema));
  } else if (schema instanceof ZodObject) {
    // @ts-ignore
    updatedSchema = extendSchema(schema, config);
    // @ts-ignore
    updatedSchema = schema.merge(updatedSchema);
  } else {
    throw new Error('The given schema must be a Zod object.');
  }

  return updatedSchema;
}

// TODO: Make the function either partial or hoc
// Which returns a function that takes data later
export function applyConditionalRequirements(
  schema: ZodTypeAny,
  config: any,
  data: any
) {
  if (
    schema instanceof ZodObject &&
    typeof config === 'object' &&
    !Array.isArray(config)
  ) {
    const shape = schema.shape;
    const newShape = Object.fromEntries(
      Object.entries(shape).map(([key, value]) => {
        if (
          config[key] &&
          (config[key].requiredIf || typeof config[key] === 'function')
        ) {
          const condition = config[key].requiredIf ?? config[key];
          if (typeof condition === 'function' && condition(data)) {
            // @ts-ignore
            return [key, value.unwrap()];
          }
        }
        return [key, value];
      })
    );
    return z.object(newShape);
  }
  return schema;
}
