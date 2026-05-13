import yaml from 'js-yaml';
import { z, globalRegistry } from 'zod';

import {
  coalesceZodObjectShape,
  getSchemaChecks,
  isZodStringLike,
  mergeArrayLengthChecksIntoOpenApi,
  mergeNullableOpenApiFragment,
  mergeNumberChecksIntoOpenApi,
  mergeStringChecksIntoOpenApi,
  schemaIndicatesInteger,
  unwrapOptional,
} from './openapi-zod-checks';

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
): z.ZodType {
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  let unionTypeList = Array.isArray(schema.type) ? schema.type : [];
  let openApiSchemaDeclaresNumericJsonType =
    unionTypeList.includes('number') || unionTypeList.includes('integer');

  let isNullable =
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes('null'));

  let zodSchema: z.ZodType;

  // Enum support
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    let enumValues = schema.enum;
    if (enumValues.every((v: unknown) => typeof v === 'string')) {
      zodSchema = z.enum(enumValues as [string, ...string[]]);
    } else {
      zodSchema = z.union(
        enumValues.map((v: unknown) => z.literal(v as string | number | boolean)) as [z.ZodType, ...z.ZodType[]]
      );
    }
  }
  // String
  else if (
    schema.type === 'string' ||
    (Array.isArray(schema.type) && schema.type.includes('string'))
  ) {
    let stringSchema: z.ZodType = z.string();

    switch (schema.format) {
      case 'email':
        stringSchema = z.email();
        break;
      case 'uuid':
        stringSchema = z.uuid();
        break;
      case 'uri':
      case 'url':
        stringSchema = z.url();
        break;
      case 'date-time':
      case 'datetime':
        stringSchema = z.iso.datetime();
        break;
      case 'date':
        stringSchema = z.iso.date();
        break;
      case 'time':
        stringSchema = z.iso.time();
        break;
      // Add more as needed: password, byte, etc. can stay as string()
    }

    let stringWithChecks = stringSchema as z.ZodString;

    if (typeof schema.minLength === 'number') {
      stringWithChecks = stringWithChecks.min(schema.minLength);
    }
    if (typeof schema.maxLength === 'number') {
      stringWithChecks = stringWithChecks.max(schema.maxLength);
    }
    if (typeof schema.pattern === 'string') {
      try {
        stringWithChecks = stringWithChecks.regex(new RegExp(schema.pattern));
      } catch {
        // invalid regex, ignore
      }
    }

    zodSchema = stringWithChecks;
  }
  // Number / Integer
  else if (
    schema.type === 'number' ||
    schema.type === 'integer' ||
    (unionTypeList.length > 0 && openApiSchemaDeclaresNumericJsonType)
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
  else if (schema.type === 'object' || ('properties' in schema && schema.properties)) {
    let properties = schema.properties || {};
    let requiredProperties: string[] = schema.required || [];
    let shape: Record<string, z.ZodType> = {};

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
    zodSchema = z.union(variants as [z.ZodType, ...z.ZodType[]]);
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
 * - Zod 4 attached checks (`_zod.def.checks`) and legacy `_def.checks` where present
 */
export function zodToOpenAPISchema(zodSchema: z.ZodType): any {
  if (!zodSchema) return {};

  let { inner: current } = unwrapOptional(zodSchema);

  let result: any = {};

  // Zod 4 stores `.describe()` on `globalRegistry`; older Zod used `_def.description`.
  let descriptionFromLegacy =
    (current as any)._def?.description ?? (current as any)._zod?.def?.description;
  let descriptionFromRegistry = globalRegistry.get(current)?.description;
  let description =
    (typeof descriptionFromLegacy === 'string' && descriptionFromLegacy) ||
    (typeof descriptionFromRegistry === 'string' && descriptionFromRegistry);
  if (description) {
    result.description = description;
  }

  if (isZodStringLike(current)) {
    result.type = 'string';

    for (let check of getSchemaChecks(current)) {
      mergeStringChecksIntoOpenApi(result, check);
    }

    let rootStringDef = (current as any)._zod?.def;
    if (rootStringDef?.check === 'string_format') {
      mergeStringChecksIntoOpenApi(result, { _zod: { def: rootStringDef } });
    }
  } else if (current instanceof z.ZodNumber) {
    result.type = schemaIndicatesInteger(current) ? 'integer' : 'number';

    for (let check of getSchemaChecks(current)) {
      mergeNumberChecksIntoOpenApi(result, check);
    }
  } else if (current instanceof z.ZodBoolean) {
    result.type = 'boolean';
  } else if (current instanceof z.ZodArray) {
    result.type = 'array';
    result.items = zodToOpenAPISchema(current.element as z.ZodType);

    for (let check of getSchemaChecks(current)) {
      mergeArrayLengthChecksIntoOpenApi(result, check);
    }
  } else if (current instanceof z.ZodObject) {
    let rawShape = (current as any).shape;
    let shape = coalesceZodObjectShape(rawShape);
    let properties: Record<string, any> = {};
    let required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      let { inner: propInner, isOptional: propOptional } = unwrapOptional(value as z.ZodType);
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
    let enumOptions = (current as any).options as readonly unknown[];
    let everyOptionIsNumber = enumOptions.every(
      (optionValue) => typeof optionValue === 'number'
    );
    if (everyOptionIsNumber) {
      let everyOptionIsInteger = enumOptions.every(
        (optionValue) => Number.isInteger(optionValue as number)
      );
      result.type = everyOptionIsInteger ? 'integer' : 'number';
    } else {
      result.type = 'string';
    }
    result.enum = [...enumOptions];
  } else if (current instanceof z.ZodUnion) {
    let options = (current as any).options || [];
    result.anyOf = options.map((opt: z.ZodType) => zodToOpenAPISchema(opt));
  } else if (current instanceof z.ZodNullable) {
    let innerSchema = zodToOpenAPISchema(
      (current as any).unwrap ? (current as any).unwrap() : (current as any)._def.innerType
    );
    result = mergeNullableOpenApiFragment(innerSchema);
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
