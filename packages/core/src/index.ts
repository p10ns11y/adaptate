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
    updatedSchema = makeSchemaRequired(schema.element, config['*']);
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

export function openAPISchemaToZod(
  schema: any,
  propertyKey: string = '',
  required: string[] = []
): ZodTypeAny {
  // Handle string type, including specific formats like email
  if (schema.type === 'string') {
    let zodSchema = z.string();
    if (schema.format === 'email') {
      zodSchema = zodSchema.email();
    }

    return required.includes(propertyKey) ? zodSchema : zodSchema.optional();
    // Handle number type
  } else if (schema.type === 'number') {
    let zodSchema = z.number();
    return required.includes(propertyKey) ? zodSchema : zodSchema.optional();
    // Handle integer type
  } else if (schema.type === 'integer') {
    let zodSchema = z.number().int();
    return required.includes(propertyKey) ? zodSchema : zodSchema.optional();
    // Handle boolean type
  } else if (schema.type === 'boolean') {
    let zodSchema = z.boolean();
    return required.includes(propertyKey) ? zodSchema : zodSchema.optional();
    // Handle array type
  } else if (schema.type === 'array') {
    const itemsSchema = schema.items
      ? openAPISchemaToZod(schema.items, propertyKey, required)
      : z.any();

    return required.includes(propertyKey)
      ? z.array(itemsSchema)
      : z.array(itemsSchema.optional());
    // Handle object type by converting properties recursively
  } else if (schema.type === 'object') {
    const properties = schema.properties || {};
    const requiredProperties = schema.required || [];
    const shape = Object.fromEntries(
      Object.entries(properties).map((entry) => {
        let [key, value] = entry;
        let zodSchema = openAPISchemaToZod(value, key, requiredProperties);
        // If the property is not in the required list, make it optional
        if (!requiredProperties.includes(key)) {
          zodSchema = zodSchema.optional();
        }
        return [key, zodSchema];
      })
    );
    return z.object(shape);
  }
  // Default case for unsupported types
  return z.any();
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
