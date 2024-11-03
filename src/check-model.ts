import { ZodSchema, ZodObject, ZodArray, ZodTypeAny } from 'zod';

type Config = {
  requiredProperties: Record<string, boolean>;
};

/**
 * Check the given Zod schema and unwrap the properties that are required.
 * @param schema - The Zod schema to check.
 * @param config - The configuration object.
 */
function checkModel(schema: ZodSchema<any>, config: Config) {
  const { requiredProperties } = config;

  const checkProperties = (object: ZodObject<any>, path: string = '') => {
    const shape = object.shape;

    for (const key in shape) {
      const currentPath = path ? `${path}.${key}` : key;

      if (requiredProperties[currentPath]) {
        shape[key] = shape[key].unwrap();
      }

      const keyShape = shape[key]?.isOptional?.()
        ? shape[key].unwrap()
        : shape[key];

      // Recursively check nested structures
      if (keyShape instanceof ZodObject) {
        checkProperties(keyShape as ZodObject<any>, currentPath);
      } else if (keyShape instanceof ZodArray) {
        // Handle list elements if it's an array
        // Assuming we use a Zod array type here
        const element = keyShape.element as ZodTypeAny;
        if (element instanceof ZodObject) {
          checkProperties(element as ZodObject<any>, currentPath);
        }
      }
    }
  };

  if (schema instanceof ZodObject) {
    checkProperties(schema);
  } else {
    console.error('The given schema must be a Zod object.');
  }
}

export { checkModel };
