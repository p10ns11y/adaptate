import { ZodSchema, ZodObject, ZodArray, ZodTypeAny } from 'zod';

type Config = {
  requiredProperties: Record<string, boolean>;
};

// The main function that performs the checking
function checkModel(schema: ZodSchema<any>, config: Config) {
  const { requiredProperties } = config;

  // Function to recursively check properties
  const checkProperties = (object: ZodObject<any>, path: string = '') => {
    const shape = object.shape;

    for (const key in shape) {
      const currentPath = path ? `${path}.${key}` : key;

      if (requiredProperties[currentPath]) {
        // Mark the property as required in the Zod schema
        shape[key] = shape[key].unwrap();
      }

      const keyShape = shape[key]?.isOptional?.()
        ? shape[key].unwrap()
        : shape[key];

      // Recursively check nested structures
      if (keyShape instanceof ZodObject) {
        console.log('inside', { currentPath });
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
