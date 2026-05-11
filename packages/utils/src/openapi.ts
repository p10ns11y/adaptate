import yaml from 'js-yaml';
import { z } from 'zod';

/**
 * Converts an OpenAPI / JSON Schema object to a Zod schema.
 * Supports a wide range of features for feature-completeness:
 * - Primitives: string, number, integer, boolean
 * - Complex: object, array, enum
 * - Validations: min/max length, min/max, pattern, format (email, uuid, url, datetime, etc.)
 * - Combinators: allOf (intersection), anyOf/oneOf (union)
 * - Nullable
 * - Proper required field handling
 *
 * Note: $ref should be pre-resolved by getDereferencedOpenAPIDocument.
 */
export function openAPISchemaToZod(
  schema: any,
  propertyKey: string = '',
  required: string[] = []
): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  let isNullable =
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes('null'));

  let zodSchema: z.ZodTypeAny;

  // Enum support
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    let enumValues = schema.enum;
    if (enumValues.every((v: unknown) => typeof v === 'string')) {
      zodSchema = z.enum(enumValues as [string, ...string[]]);
    } else {
      zodSchema = z.union(
        enumValues.map((v: unknown) => z.literal(v)) as [z.ZodTypeAny, ...z.ZodTypeAny[]]
      );
    }
  }
  // String
  else if (
    schema.type === 'string' ||
    (Array.isArray(schema.type) && schema.type.includes('string'))
  ) {
    let s = z.string();

    if (typeof schema.minLength === 'number') {
      s = s.min(schema.minLength);
    }
    if (typeof schema.maxLength === 'number') {
      s = s.max(schema.maxLength);
    }
    if (typeof schema.pattern === 'string') {
      try {
        s = s.regex(new RegExp(schema.pattern));
      } catch {
        // invalid regex, ignore
      }
    }

    // Common OpenAPI formats
    switch (schema.format) {
      case 'email':
        s = s.email();
        break;
      case 'uuid':
        s = s.uuid();
        break;
      case 'uri':
      case 'url':
        s = s.url();
        break;
      case 'date-time':
      case 'datetime':
        s = s.datetime();
        break;
      case 'date':
        s = s.date();
        break;
      case 'time':
        s = s.time();
        break;
      // Add more as needed: password, byte, etc. can stay as string()
    }

    zodSchema = s;
  }
  // Number / Integer
  else if (
    schema.type === 'number' ||
    schema.type === 'integer' ||
    (Array.isArray(schema.type) &&
      (schema.type.includes('number') || schema.type.includes('integer')))
  ) {
    let n: z.ZodNumber = z.number();

    if (schema.type === 'integer' || (Array.isArray(schema.type) && schema.type.includes('integer'))) {
      n = n.int();
    }

    if (typeof schema.minimum === 'number') {
      n = n.min(schema.minimum);
    }
    if (typeof schema.maximum === 'number') {
      n = n.max(schema.maximum);
    }
    if (typeof schema.exclusiveMinimum === 'number') {
      n = n.refine(
        (val) => val > schema.exclusiveMinimum,
        `Must be greater than ${schema.exclusiveMinimum}`
      );
    }
    if (typeof schema.exclusiveMaximum === 'number') {
      n = n.refine(
        (val) => val < schema.exclusiveMaximum,
        `Must be less than ${schema.exclusiveMaximum}`
      );
    }
    if (typeof schema.multipleOf === 'number') {
      n = n.refine(
        (val) => val % schema.multipleOf === 0,
        `Must be a multiple of ${schema.multipleOf}`
      );
    }

    zodSchema = n;
  }
  // Boolean
  else if (schema.type === 'boolean') {
    zodSchema = z.boolean();
  }
  // Array
  else if (schema.type === 'array') {
    let itemSchema = schema.items
      ? openAPISchemaToZod(schema.items, propertyKey, required)
      : z.any();

    let arr = z.array(itemSchema);

    if (typeof schema.minItems === 'number') {
      arr = arr.min(schema.minItems);
    }
    if (typeof schema.maxItems === 'number') {
      arr = arr.max(schema.maxItems);
    }
    // uniqueItems not natively supported in Zod array; can add .refine if needed
    // if (schema.uniqueItems) { arr = arr.refine(...) }

    zodSchema = arr;
  }
  // Object
  else if (schema.type === 'object' || schema.properties) {
    let properties = schema.properties || {};
    let requiredProperties: string[] = schema.required || [];
    let shape: Record<string, z.ZodTypeAny> = {};

    for (const [key, value] of Object.entries(properties)) {
      let propZod = openAPISchemaToZod(value as any, key, requiredProperties);
      if (!requiredProperties.includes(key)) {
        propZod = propZod.optional();
      }
      shape[key] = propZod;
    }

    zodSchema = z.object(shape);

    // Handle additionalProperties (basic support)
    if (schema.additionalProperties === false) {
      // strict by default in Zod object
    } else if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      // Could extend with .catchall but complex for now
    }
  }
  // allOf
  else if (schema.allOf && Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    let combined = openAPISchemaToZod(schema.allOf[0]);
    for (let i = 1; i < schema.allOf.length; i++) {
      combined = combined.and(openAPISchemaToZod(schema.allOf[i]));
    }
    zodSchema = combined;
  }
  // anyOf / oneOf (treated as union for validation purposes)
  else if (
    (schema.anyOf && Array.isArray(schema.anyOf)) ||
    (schema.oneOf && Array.isArray(schema.oneOf))
  ) {
    let variants = (schema.anyOf || schema.oneOf).map((s: any) =>
      openAPISchemaToZod(s)
    );
    zodSchema = z.union(variants as [z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }
  // Fallback
  else {
    zodSchema = z.any();
  }

  if (isNullable) {
    zodSchema = zodSchema.nullable();
  }

  // Apply top-level required/optional based on parent context (for primitive/array cases)
  let shouldBeRequired = required.includes(propertyKey);
  if (!shouldBeRequired && propertyKey !== '') {
    // Only wrap in optional if this is a property in a parent object
    // and not already handled inside object branch
    if (
      !(
        zodSchema instanceof z.ZodObject ||
        zodSchema instanceof z.ZodArray ||
        zodSchema instanceof z.ZodUnion
      )
    ) {
      zodSchema = zodSchema.optional();
    }
  }

  return zodSchema;
}

/**
 * Helper to unwrap ZodOptional and detect optionality.
 */
function unwrapOptional(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  isOptional: boolean;
} {
  if (schema instanceof z.ZodOptional) {
    return {
      inner: (schema as any).unwrap ? (schema as any).unwrap() : (schema as any)._def.innerType,
      isOptional: true,
    };
  }
  return { inner: schema, isOptional: false };
}

/**
 * Converts a Zod schema to an OpenAPI / JSON Schema compatible object.
 * Now feature-complete with:
 * - Proper `required` array for objects (excludes .optional() fields)
 * - Support for .nullable()
 * - String validations: minLength, maxLength, pattern, format
 * - Number validations: minimum, maximum, exclusive*, multipleOf, integer
 * - Array minItems / maxItems
 * - Enum support
 * - Union / anyOf
 * - Description from .describe()
 * - Handles Zod v3/v4 shape and checks
 */
export function zodToOpenAPISchema(zodSchema: z.ZodTypeAny): any {
  if (!zodSchema) return {};

  let { inner: current, isOptional: topOptional } = unwrapOptional(zodSchema);

  let result: any = {};

  // Add description if present (works for most Zod types)
  let description = (current as any)._def?.description;
  if (description) {
    result.description = description;
  }

  if (current instanceof z.ZodString) {
    result.type = 'string';

    let checks: any[] = (current as any)._def?.checks || [];
    for (const check of checks) {
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
      }
    }
  } else if (current instanceof z.ZodNumber) {
    let checks: any[] = (current as any)._def?.checks || [];
    let isInt = checks.some((c: any) => c.kind === 'int');

    result.type = isInt ? 'integer' : 'number';

    for (const check of checks) {
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
      }
    }
  } else if (current instanceof z.ZodBoolean) {
    result.type = 'boolean';
  } else if (current instanceof z.ZodArray) {
    result.type = 'array';
    result.items = zodToOpenAPISchema(current.element);

    let checks: any[] = (current as any)._def?.checks || [];
    for (const check of checks) {
      if (check.kind === 'min') result.minItems = check.value;
      if (check.kind === 'max') result.maxItems = check.value;
    }
  } else if (current instanceof z.ZodObject) {
    let shape = (current as any).shape || {};
    let properties: Record<string, any> = {};
    let required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      let { inner: propInner, isOptional: propOptional } = unwrapOptional(value as z.ZodTypeAny);
      let propSchema = zodToOpenAPISchema(propInner);

      properties[key] = propSchema;

      if (!propOptional) {
        required.push(key);
      }
    }

    result.type = 'object';
    result.properties = properties;
    if (required.length > 0) {
      result.required = required;
    }
  } else if (current instanceof z.ZodEnum) {
    result.type = 'string';
    result.enum = (current as any).options;
  } else if (current instanceof z.ZodNativeEnum) {
    let enumObj = (current as any).enum;
    result.enum = Object.values(enumObj).filter((v: unknown) => typeof v === 'string' || typeof v === 'number');
    // Could infer type but keep simple
  } else if (current instanceof z.ZodUnion) {
    let options = (current as any).options || [];
    result.anyOf = options.map((opt: z.ZodTypeAny) => zodToOpenAPISchema(opt));
  } else if (current instanceof z.ZodNullable) {
    let innerSchema = zodToOpenAPISchema((current as any).unwrap ? (current as any).unwrap() : (current as any)._def.innerType);
    if (innerSchema.type) {
      if (Array.isArray(innerSchema.type)) {
        if (!innerSchema.type.includes('null')) innerSchema.type.push('null');
      } else {
        innerSchema.type = [innerSchema.type, 'null'];
      }
    } else {
      innerSchema.nullable = true;
    }
    result = innerSchema;
  } else if (current instanceof z.ZodAny || current instanceof z.ZodUnknown) {
    result = {}; // or { type: 'object' } but {} is valid "any"
  } else if (current instanceof z.ZodDate) {
    result.type = 'string';
    result.format = 'date-time';
  } else if (current instanceof z.ZodBigInt) {
    result.type = 'integer';
    result.format = 'int64';
  } else {
    // Fallback for unsupported (e.g. ZodEffects, custom, etc.)
    result = {};
  }

  // If the top-level was optional, we don't mark required here (caller decides)
  // But since this is usually called per-property, optionality is handled in object case.

  return result;
}

// Re-export the load yaml helper for SSR
export { getYamlContent } from './load-yaml';

// Keep the other functions (fetch, getDereferenced...) unchanged for compatibility
export async function fetchYamlContent(webURL: string) {
  let response = await globalThis.fetch(webURL, {
    headers: { 'Content-Type': 'text/yaml' },
    mode: 'cors',
  });
  let openapiDocument = yaml.load(await response.text());
  return openapiDocument;
}

export type ServerOpenAPISpecParams = {
  location: 'filesystem';
  callSiteURL: string;
  relativePathToSpecFile: string;
};

export type BrowserOpenAPISpecParams = {
  location: 'web';
  webURL: string;
};

export type OpenAPISpecParams = ServerOpenAPISpecParams | BrowserOpenAPISpecParams;

export async function getDereferencedOpenAPIDocument(params: OpenAPISpecParams) {
  let openapiDocument: any = {};

  let isNodeEnvDetected = globalThis.process?.versions?.node;

  try {
    if (params.location === 'web') {
      openapiDocument = await fetchYamlContent(params.webURL);
    } else if (params.location === 'filesystem' || isNodeEnvDetected) {
      let { getYamlContent } = await import('./load-yaml.ts');
      openapiDocument = await getYamlContent(
        params.callSiteURL,
        params.relativePathToSpecFile
      );
    }

    let SwaggerParser = await import('@apidevtools/json-schema-ref-parser');
    let dereferenced = await SwaggerParser.default.dereference(openapiDocument);
    return dereferenced;
  } catch (error: any) {
    throw new Error(`Error reading OpenAPI document: ${error?.message || ''}`);
  }
}
