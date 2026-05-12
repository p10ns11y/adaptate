import { z } from 'zod';

// ============================================================================
// TransformConfig Type
// ============================================================================

/**
 * Configuration type for transformSchema.
 * - `true`  → make field required (unwrap ZodOptional)
 * - `false` → make field optional (wrap with .optional())
 * - `{ '*': NestedConfig }` → apply NestedConfig to all items (for arrays/objects)
 * - Nested object → recursively transform
 */
export type TransformConfig = {
  [key: string]:
    | boolean
    | { '*': TransformConfig }
    | TransformConfig;
};

// ============================================================================
// Helper Types
// ============================================================================

type MakeRequired<T extends z.ZodTypeAny> =
  T extends z.ZodOptional<infer U> ? U : T;

type MakeOptional<T extends z.ZodTypeAny> =
  T extends z.ZodOptional<any> ? T : z.ZodOptional<T>;

// ============================================================================
// Main TransformSchemaType (Recursive)
// ============================================================================

export type TransformSchemaType<
  TSchema extends z.ZodTypeAny,
  TConfig extends TransformConfig
> = TSchema extends z.ZodObject<infer Shape, infer UnknownKeys, infer Catchall>
  ? z.ZodObject<
      {
        [K in keyof Shape]: K extends keyof TConfig
          ? TConfig[K] extends true
            ? MakeRequired<Shape[K]>
            : TConfig[K] extends false
              ? MakeOptional<Shape[K]>
              : TConfig[K] extends { '*': infer NestedConfig }
                ? Shape[K] extends z.ZodArray<infer Item>
                  ? z.ZodArray<TransformSchemaType<Item, NestedConfig & TransformConfig>>
                  : Shape[K]
                : TConfig[K] extends object
                  ? TransformSchemaType<Shape[K], TConfig[K] & TransformConfig>
                  : Shape[K]
          : Shape[K];
      },
      UnknownKeys,
      Catchall
    >
  : TSchema extends z.ZodArray<infer Item>
    ? TConfig extends { '*': infer NestedConfig }
      ? z.ZodArray<TransformSchemaType<Item, NestedConfig & TransformConfig>>
      : TSchema
    : TSchema;

// ============================================================================
// transformSchema Implementation
// ============================================================================

export function transformSchema<
  TSchema extends z.ZodTypeAny,
  TConfig extends TransformConfig
>(
  schema: TSchema,
  config: TConfig
): TransformSchemaType<TSchema, TConfig> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const newShape: Record<string, z.ZodTypeAny> = {};

    for (const key of Object.keys(shape)) {
      const fieldSchema = shape[key];
      const fieldConfig = config[key];

      if (fieldConfig === true) {
        newShape[key] = fieldSchema instanceof z.ZodOptional
          ? (fieldSchema as any).unwrap()
          : fieldSchema;
      } else if (fieldConfig === false) {
        newShape[key] = fieldSchema instanceof z.ZodOptional
          ? fieldSchema
          : fieldSchema.optional();
      } else if (
        typeof fieldConfig === 'object' &&
        fieldConfig !== null &&
        '*' in fieldConfig
      ) {
        if (fieldSchema instanceof z.ZodArray) {
          const itemSchema = fieldSchema.element;
          const nestedConfig = (fieldConfig as any)['*'] as TransformConfig;

          if (Object.keys(nestedConfig).length > 0) {
            const transformedItem = transformSchema(itemSchema, nestedConfig);
            newShape[key] = z.array(transformedItem);
          } else {
            newShape[key] = fieldSchema;
          }
        } else {
          newShape[key] = fieldSchema;
        }
      } else if (typeof fieldConfig === 'object' && fieldConfig !== null) {
        if (fieldSchema instanceof z.ZodObject) {
          newShape[key] = transformSchema(fieldSchema, fieldConfig as TransformConfig);
        } else if (fieldSchema instanceof z.ZodArray && fieldSchema.element instanceof z.ZodObject) {
          const transformedItem = transformSchema(
            fieldSchema.element,
            fieldConfig as TransformConfig
          );
          newShape[key] = z.array(transformedItem);
        } else {
          newShape[key] = fieldSchema;
        }
      } else {
        newShape[key] = fieldSchema;
      }
    }

    return z.object(newShape) as TransformSchemaType<TSchema, TConfig>;
  }

  if (schema instanceof z.ZodArray && config['*']) {
    const itemSchema = schema.element;
    const nestedConfig = config['*'] as TransformConfig;
    const transformedItem = transformSchema(itemSchema, nestedConfig);
    return z.array(transformedItem) as TransformSchemaType<TSchema, TConfig>;
  }

  return schema as TransformSchemaType<TSchema, TConfig>;
}

// Re-export for convenience
export { z } from 'zod';
