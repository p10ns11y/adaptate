import { z, ZodObject, ZodArray, ZodTypeAny } from 'zod';

export type Config = Record<string, any>;

// @ts-ignore
export function makeSchemaRequired(
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
            return [key, extendSchema(unwrappedValue, partialConfig[key])];
          }
          return [key, unwrappedValue];
        })
      );

      let updatedPartialSchema = z.object(newShape).required();

      // @ts-ignore
      return unwrappedPartialSchema.merge(updatedPartialSchema).required();
    } else if (
      unwrappedPartialSchema instanceof ZodArray &&
      partialConfig['*']
    ) {
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

  /* if (schema instanceof ZodArray) {
    console.log('ZodArray', schema.element);
    // @ts-ignore
    updatedSchema = makeSchemaRequired(schema.element, config);
    console.log('ZodArray: updatedSchema', updatedSchema);
    updatedSchema = z.array(schema.element.merge(updatedSchema));
  } else */
  if (schema instanceof ZodObject) {
    // @ts-ignore
    updatedSchema = extendSchema(schema, config);
    // @ts-ignore
    updatedSchema = schema.merge(updatedSchema);
  } else {
    console.error('The given schema must be a Zod object.');
  }

  return updatedSchema;
}

export function jsonSchemaToZod(schema: any): ZodTypeAny {
  if (schema.type === 'string') {
    let zodSchema = z.string();
    if (schema.format === 'email') {
      zodSchema = zodSchema.email();
    }
    return zodSchema;
  } else if (schema.type === 'number') {
    return z.number();
  } else if (schema.type === 'integer') {
    return z.number().int();
  } else if (schema.type === 'boolean') {
    return z.boolean();
  } else if (schema.type === 'array') {
    const itemsSchema = schema.items ? jsonSchemaToZod(schema.items) : z.any();
    return z.array(itemsSchema);
  } else if (schema.type === 'object') {
    const properties = schema.properties || {};
    const shape = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [
        key,
        jsonSchemaToZod(value),
      ])
    );
    return z.object(shape);
  }
  return z.any();
}

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

export function zodToOpenAPISchema(schema: ZodTypeAny): any {
  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  } else if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  } else if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  } else if (schema instanceof ZodArray) {
    return { type: 'array', items: zodToOpenAPISchema(schema.element) };
  } else if (schema instanceof ZodObject) {
    const properties = Object.fromEntries(
      Object.entries(schema.shape).map(([key, value]) => {
        // @ts-ignore
        return [key, zodToOpenAPISchema(value)];
      })
    );
    return { type: 'object', properties };
  }
  return {};
}
