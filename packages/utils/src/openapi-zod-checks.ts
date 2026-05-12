import { z } from 'zod';

/**
 * Helpers shared by `zodToOpenAPISchema` and unit tests.
 * Keeps Zod 3-style `check.kind` handling alongside Zod 4 `_zod.def.checks`.
 */

export function unwrapOptional(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  isOptional: boolean;
} {
  if (schema instanceof z.ZodOptional) {
    let schemaAny = schema as any;
    return {
      inner: schemaAny.unwrap ? schemaAny.unwrap() : schemaAny._def.innerType,
      isOptional: true,
    };
  }
  return { inner: schema, isOptional: false };
}

/** Zod 4 string schemas (`z.email()`, …) are not `instanceof ZodString` but use `_zod.def.type === 'string'`. */
export function isZodStringLike(schema: z.ZodTypeAny): boolean {
  return (
    schema instanceof z.ZodString ||
    (schema as any)._zod?.def?.type === 'string'
  );
}

export function getSchemaChecks(schema: z.ZodTypeAny): any[] {
  let fromZod4 = (schema as any)._zod?.def?.checks;
  if (Array.isArray(fromZod4)) {
    return fromZod4;
  }
  let legacy = (schema as any)._def?.checks;
  return Array.isArray(legacy) ? legacy : [];
}

export function applyOpenApiStringFormatFromDef(
  result: Record<string, any>,
  format: string
) {
  if (format === 'email') {
    result.format = 'email';
  } else if (format === 'uuid' || format === 'guid') {
    result.format = 'uuid';
  } else if (format === 'url') {
    result.format = 'uri';
  } else if (format === 'datetime') {
    result.format = 'date-time';
  } else if (format === 'date') {
    result.format = 'date';
  } else if (format === 'time') {
    result.format = 'time';
  }
}

export function mergeStringChecksIntoOpenApi(result: Record<string, any>, check: any) {
  if (check?.kind) {
    switch (check.kind) {
      case 'min':
        result.minLength = check.value;
        break;
      case 'max':
        result.maxLength = check.value;
        break;
      case 'regex':
        result.pattern = check.regex.source || check.regex.toString();
        break;
      case 'email':
        result.format = 'email';
        break;
      case 'uuid':
        result.format = 'uuid';
        break;
      case 'url':
        result.format = 'uri';
        break;
      case 'datetime':
        result.format = 'date-time';
        break;
      case 'date':
        result.format = 'date';
        break;
      default:
        break;
    }
    return;
  }
  let def = check?._zod?.def;
  if (!def?.check) {
    return;
  }
  switch (def.check) {
    case 'min_length':
      result.minLength = def.minimum;
      break;
    case 'max_length':
      result.maxLength = def.maximum;
      break;
    case 'string_format': {
      let format = def.format as string;
      if (format === 'regex' && def.pattern) {
        let pattern = def.pattern as RegExp;
        result.pattern =
          typeof pattern.source === 'string' ? pattern.source : String(pattern);
      } else {
        applyOpenApiStringFormatFromDef(result, format);
      }
      break;
    }
    default:
      break;
  }
}

export function schemaIndicatesInteger(schema: z.ZodNumber): boolean {
  for (let check of getSchemaChecks(schema)) {
    if (check?.kind === 'int') {
      return true;
    }
    let def = check?._zod?.def;
    if (def?.check === 'number_format' && def.format === 'safeint') {
      return true;
    }
  }
  return false;
}

export function mergeNumberChecksIntoOpenApi(result: Record<string, any>, check: any) {
  if (check?.kind) {
    switch (check.kind) {
      case 'min':
        result.minimum = check.value;
        if (check.inclusive === false) {
          result.exclusiveMinimum = check.value;
          delete result.minimum;
        }
        break;
      case 'max':
        result.maximum = check.value;
        if (check.inclusive === false) {
          result.exclusiveMaximum = check.value;
          delete result.maximum;
        }
        break;
      case 'multipleOf':
        result.multipleOf = check.value;
        break;
      default:
        break;
    }
    return;
  }
  let def = check?._zod?.def;
  if (!def?.check) {
    return;
  }
  switch (def.check) {
    case 'greater_than':
      if (def.inclusive) {
        result.minimum = def.value;
      } else {
        result.exclusiveMinimum = def.value;
        delete result.minimum;
      }
      break;
    case 'less_than':
      if (def.inclusive) {
        result.maximum = def.value;
      } else {
        result.exclusiveMaximum = def.value;
        delete result.maximum;
      }
      break;
    case 'multiple_of':
      result.multipleOf = def.value;
      break;
    default:
      break;
  }
}

/**
 * Maps Zod array length checks to OpenAPI `minItems` / `maxItems`.
 * Zod 4 commonly uses `min_length` / `max_length` on array schemas; older builds may use `min_size` / `max_size`.
 */
export function mergeArrayLengthChecksIntoOpenApi(result: Record<string, any>, check: any) {
  if (check?.kind === 'min') {
    result.minItems = check.value;
  }
  if (check?.kind === 'max') {
    result.maxItems = check.value;
  }
  let def = check?._zod?.def;
  if (!def?.check) {
    return;
  }
  if (def.check === 'min_size') {
    result.minItems = def.minimum;
  }
  if (def.check === 'max_size') {
    result.maxItems = def.maximum;
  }
  if (def.check === 'min_length' && typeof def.minimum === 'number') {
    result.minItems = def.minimum;
  }
  if (def.check === 'max_length' && typeof def.maximum === 'number') {
    result.maxItems = def.maximum;
  }
}

/**
 * Normalizes an inner OpenAPI fragment so `null` is represented alongside existing `type`,
 * matching `z.nullable(...)` semantics for JSON Schema consumers.
 */
export function mergeNullableOpenApiFragment(innerSchema: Record<string, any>): Record<string, any> {
  if (innerSchema.type) {
    if (Array.isArray(innerSchema.type)) {
      if (!innerSchema.type.includes('null')) {
        innerSchema.type.push('null');
      }
    } else {
      innerSchema.type = [innerSchema.type, 'null'];
    }
  } else {
    innerSchema.nullable = true;
  }
  return innerSchema;
}

/**
 * Zod object `shape` should always be a plain object, but some interop layers may omit it.
 * Treat missing shapes as `{}` so OpenAPI conversion stays total.
 */
export function coalesceZodObjectShape(rawShape: unknown): Record<string, unknown> {
  if (rawShape != null && typeof rawShape === 'object') {
    return rawShape as Record<string, unknown>;
  }
  return {};
}
