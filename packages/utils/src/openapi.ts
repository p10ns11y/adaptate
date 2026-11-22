import { z, globalRegistry } from 'zod';

import { dereferenceOpenApiDocument } from './dereference-local.js';
import { parseSpecDocumentText } from './parse-spec-document.js';

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
} from './openapi-zod-checks.js';

type OpenApiChild = {
  schema: any;
  propertyKey: string;
  required: string[];
};

type OpenApiPlan = {
  isNullable: boolean;
  applyTail: boolean;
  children: OpenApiChild[];
  build: (childSchemas: z.ZodType[]) => z.ZodType;
};

type OpenApiFrame = {
  schema: any;
  propertyKey: string;
  required: string[];
  plan?: OpenApiPlan;
  childIndex: number;
  childSchemas: z.ZodType[];
};

function finishOpenApiNode(
  zodSchema: z.ZodType,
  isNullable: boolean,
  propertyKey: string,
  required: string[],
): z.ZodType {
  let finished = zodSchema;
  if (isNullable) {
    finished = finished.nullable();
  }
  let shouldBeRequired = required.includes(propertyKey);
  if (!shouldBeRequired && propertyKey !== '') {
    if (
      !(
        finished instanceof z.ZodObject ||
        finished instanceof z.ZodArray ||
        finished instanceof z.ZodUnion
      )
    ) {
      finished = finished.optional();
    }
  }
  return finished;
}

function planOpenApiSchema(schema: any): OpenApiPlan {
  if (!schema || typeof schema !== 'object') {
    return {
      isNullable: false,
      applyTail: false,
      children: [],
      build: () => z.any(),
    };
  }

  let unionTypeList = Array.isArray(schema.type) ? schema.type : [];
  let openApiSchemaDeclaresNumericJsonType =
    unionTypeList.includes('number') || unionTypeList.includes('integer');
  let isNullable =
    schema.nullable === true ||
    (Array.isArray(schema.type) && schema.type.includes('null'));

  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    let enumValues = schema.enum;
    return {
      isNullable,
      applyTail: true,
      children: [],
      build: () => {
        if (enumValues.every((enumValue: unknown) => typeof enumValue === 'string')) {
          return z.enum(enumValues as [string, ...string[]]);
        }
        return z.union(
          enumValues.map((enumValue: unknown) =>
            z.literal(enumValue as string | number | boolean),
          ) as [z.ZodType, ...z.ZodType[]],
        );
      },
    };
  }

  if (
    schema.type === 'string' ||
    (Array.isArray(schema.type) && schema.type.includes('string'))
  ) {
    return {
      isNullable,
      applyTail: true,
      children: [],
      build: () => {
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
            void schema.pattern;
          }
        }
        return stringWithChecks;
      },
    };
  }

  if (
    schema.type === 'number' ||
    schema.type === 'integer' ||
    (unionTypeList.length > 0 && openApiSchemaDeclaresNumericJsonType)
  ) {
    return {
      isNullable,
      applyTail: true,
      children: [],
      build: () => {
        let numberSchema: z.ZodNumber = z.number();
        if (
          schema.type === 'integer' ||
          (Array.isArray(schema.type) && schema.type.includes('integer'))
        ) {
          numberSchema = numberSchema.int();
        }
        if (typeof schema.minimum === 'number') {
          numberSchema = numberSchema.min(schema.minimum);
        }
        if (typeof schema.maximum === 'number') {
          numberSchema = numberSchema.max(schema.maximum);
        }
        if (typeof schema.exclusiveMinimum === 'number') {
          numberSchema = numberSchema.refine(
            (numericValue) => numericValue > schema.exclusiveMinimum,
            `Must be greater than ${schema.exclusiveMinimum}`,
          );
        }
        if (typeof schema.exclusiveMaximum === 'number') {
          numberSchema = numberSchema.refine(
            (numericValue) => numericValue < schema.exclusiveMaximum,
            `Must be less than ${schema.exclusiveMaximum}`,
          );
        }
        if (typeof schema.multipleOf === 'number') {
          numberSchema = numberSchema.refine(
            (numericValue) => numericValue % schema.multipleOf === 0,
            `Must be a multiple of ${schema.multipleOf}`,
          );
        }
        return numberSchema;
      },
    };
  }

  if (schema.type === 'boolean') {
    return {
      isNullable,
      applyTail: true,
      children: [],
      build: () => z.boolean(),
    };
  }

  if (schema.type === 'array') {
    let children: OpenApiChild[] = schema.items
      ? [{ schema: schema.items, propertyKey: '', required: [] }]
      : [];
    return {
      isNullable,
      applyTail: true,
      children,
      build: (childSchemas) => {
        let itemSchema = schema.items ? (childSchemas[0] as z.ZodType) : z.any();
        let arraySchema = z.array(itemSchema);
        if (typeof schema.minItems === 'number') {
          arraySchema = arraySchema.min(schema.minItems);
        }
        if (typeof schema.maxItems === 'number') {
          arraySchema = arraySchema.max(schema.maxItems);
        }
        return arraySchema;
      },
    };
  }

  if (schema.type === 'object' || ('properties' in schema && schema.properties)) {
    let properties = schema.properties || {};
    let requiredProperties: string[] = schema.required || [];
    let propertyEntries = Object.entries(properties);
    return {
      isNullable,
      applyTail: true,
      children: propertyEntries.map(([key, value]) => ({
        schema: value,
        propertyKey: key,
        required: requiredProperties,
      })),
      build: (childSchemas) => {
        let shape: Record<string, z.ZodType> = {};
        for (let index = 0; index < propertyEntries.length; index += 1) {
          let key = propertyEntries[index]?.[0] as string;
          let propertySchema = childSchemas[index] as z.ZodType;
          if (
            !requiredProperties.includes(key) &&
            !unwrapOptional(propertySchema).isOptional
          ) {
            propertySchema = propertySchema.optional();
          }
          shape[key] = propertySchema;
        }
        if (schema.additionalProperties === false) {
          void shape;
        } else if (
          schema.additionalProperties &&
          typeof schema.additionalProperties === 'object'
        ) {
          void schema.additionalProperties;
        }
        return z.object(shape);
      },
    };
  }

  if (schema.allOf && Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return {
      isNullable,
      applyTail: true,
      children: schema.allOf.map((part: any) => ({
        schema: part,
        propertyKey: '',
        required: [] as string[],
      })),
      build: (childSchemas) => {
        let combined = childSchemas[0] as z.ZodType;
        for (let index = 1; index < childSchemas.length; index += 1) {
          combined = combined.and(childSchemas[index] as z.ZodType);
        }
        return combined;
      },
    };
  }

  if (
    (schema.anyOf && Array.isArray(schema.anyOf)) ||
    (schema.oneOf && Array.isArray(schema.oneOf))
  ) {
    let variants = schema.anyOf || schema.oneOf;
    return {
      isNullable,
      applyTail: true,
      children: variants.map((part: any) => ({
        schema: part,
        propertyKey: '',
        required: [] as string[],
      })),
      build: (childSchemas) => z.union(childSchemas as [z.ZodType, ...z.ZodType[]]),
    };
  }

  return {
    isNullable,
    applyTail: true,
    children: [],
    build: () => z.any(),
  };
}

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
  required: string[] = [],
): z.ZodType {
  let stack: OpenApiFrame[] = [
    { schema, propertyKey, required, childIndex: 0, childSchemas: [] },
  ];
  let ancestorSchemas = new Set<object>();
  let produced: z.ZodType = z.any();
  while (stack.length > 0) {
    let frame = stack[stack.length - 1] as OpenApiFrame;
    if (frame.plan === undefined) {
      if (frame.schema && typeof frame.schema === 'object') {
        ancestorSchemas.add(frame.schema);
      }
      frame.plan = planOpenApiSchema(frame.schema);
    }
    let plan = frame.plan;
    if (frame.childIndex < plan.children.length) {
      let child = plan.children[frame.childIndex] as OpenApiChild;
      frame.childIndex += 1;
      if (child.schema && typeof child.schema === 'object' && ancestorSchemas.has(child.schema)) {
        throw new RangeError(
          'OpenAPI schema cycle: a child schema is already an ancestor on the active stack.',
        );
      }
      stack.push({
        schema: child.schema,
        propertyKey: child.propertyKey,
        required: child.required,
        childIndex: 0,
        childSchemas: [],
      });
      continue;
    }
    let built = plan.build(frame.childSchemas);
    if (plan.applyTail) {
      built = finishOpenApiNode(built, plan.isNullable, frame.propertyKey, frame.required);
    }
    if (frame.schema && typeof frame.schema === 'object') {
      ancestorSchemas.delete(frame.schema);
    }
    stack.pop();
    let parent = stack[stack.length - 1];
    if (parent) parent.childSchemas.push(built);
    else produced = built;
  }
  return produced;
}

type ZodOpenApiPlan = {
  children: z.ZodType[];
  build: (childResults: any[]) => any;
};

type ZodOpenApiFrame = {
  zodSchema: z.ZodType;
  plan?: ZodOpenApiPlan;
  childIndex: number;
  childResults: any[];
};

function describedOpenApiResult(current: z.ZodType): Record<string, any> {
  let result: Record<string, any> = {};
  let descriptionFromLegacy =
    (current as any)._def?.description ?? (current as any)._zod?.def?.description;
  let descriptionFromRegistry = globalRegistry.get(current)?.description;
  let description =
    (typeof descriptionFromLegacy === 'string' && descriptionFromLegacy) ||
    (typeof descriptionFromRegistry === 'string' && descriptionFromRegistry);
  if (description) {
    result.description = description;
  }
  return result;
}

function planZodOpenApiSchema(zodSchema: z.ZodType): ZodOpenApiPlan {
  let { inner: current } = unwrapOptional(zodSchema);
  let starter = describedOpenApiResult(current);

  if (isZodStringLike(current)) {
    return {
      children: [],
      build: () => {
        starter.type = 'string';
        for (let check of getSchemaChecks(current)) {
          mergeStringChecksIntoOpenApi(starter, check);
        }
        let rootStringDef = (current as any)._zod?.def;
        if (rootStringDef?.check === 'string_format') {
          mergeStringChecksIntoOpenApi(starter, { _zod: { def: rootStringDef } });
        }
        return starter;
      },
    };
  }

  if (current instanceof z.ZodNumber) {
    return {
      children: [],
      build: () => {
        starter.type = schemaIndicatesInteger(current) ? 'integer' : 'number';
        for (let check of getSchemaChecks(current)) {
          mergeNumberChecksIntoOpenApi(starter, check);
        }
        return starter;
      },
    };
  }

  if (current instanceof z.ZodBoolean) {
    return {
      children: [],
      build: () => {
        starter.type = 'boolean';
        return starter;
      },
    };
  }

  if (current instanceof z.ZodArray) {
    return {
      children: [current.element as z.ZodType],
      build: (childResults) => {
        starter.type = 'array';
        starter.items = childResults[0];
        for (let check of getSchemaChecks(current)) {
          mergeArrayLengthChecksIntoOpenApi(starter, check);
        }
        return starter;
      },
    };
  }

  if (current instanceof z.ZodObject) {
    let rawShape = (current as any).shape;
    let shape = coalesceZodObjectShape(rawShape);
    let entries = Object.entries(shape);
    let optionalFlags: boolean[] = [];
    let children: z.ZodType[] = [];
    for (let [, propertySchema] of entries) {
      let unwrapped = unwrapOptional(propertySchema as z.ZodType);
      optionalFlags.push(unwrapped.isOptional);
      children.push(unwrapped.inner);
    }
    return {
      children,
      build: (childResults) => {
        let properties: Record<string, any> = {};
        let requiredKeys: string[] = [];
        for (let index = 0; index < entries.length; index += 1) {
          let key = entries[index]?.[0] as string;
          properties[key] = childResults[index];
          if (!optionalFlags[index]) {
            requiredKeys.push(key);
          }
        }
        starter.type = 'object';
        starter.properties = properties;
        if (requiredKeys.length > 0) {
          starter.required = requiredKeys;
        }
        return starter;
      },
    };
  }

  if (current instanceof z.ZodEnum) {
    return {
      children: [],
      build: () => {
        let enumOptions = (current as any).options as readonly unknown[];
        let everyOptionIsNumber = enumOptions.every(
          (optionValue) => typeof optionValue === 'number',
        );
        if (everyOptionIsNumber) {
          let everyOptionIsInteger = enumOptions.every((optionValue) =>
            Number.isInteger(optionValue as number),
          );
          starter.type = everyOptionIsInteger ? 'integer' : 'number';
        } else {
          starter.type = 'string';
        }
        starter.enum = [...enumOptions];
        return starter;
      },
    };
  }

  if (current instanceof z.ZodUnion) {
    let options = ((current as any).options || []) as z.ZodType[];
    return {
      children: options,
      build: (childResults) => {
        starter.anyOf = childResults;
        return starter;
      },
    };
  }

  if (current instanceof z.ZodNullable) {
    let innerSchema = (current as any).unwrap
      ? (current as any).unwrap()
      : (current as any)._def.innerType;
    return {
      children: [innerSchema as z.ZodType],
      build: (childResults) => mergeNullableOpenApiFragment(childResults[0]),
    };
  }

  if (current instanceof z.ZodAny || current instanceof z.ZodUnknown) {
    return { children: [], build: () => ({}) };
  }

  if (current instanceof z.ZodDate) {
    return {
      children: [],
      build: () => {
        starter.type = 'string';
        starter.format = 'date-time';
        return starter;
      },
    };
  }

  if (current instanceof z.ZodBigInt) {
    return {
      children: [],
      build: () => {
        starter.type = 'integer';
        starter.format = 'int64';
        return starter;
      },
    };
  }

  return { children: [], build: () => ({}) };
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

  let stack: ZodOpenApiFrame[] = [{ zodSchema, childIndex: 0, childResults: [] }];
  let ancestorSchemas = new Set<z.ZodType>();
  let produced: any = {};
  while (stack.length > 0) {
    let frame = stack[stack.length - 1] as ZodOpenApiFrame;
    if (frame.plan === undefined) {
      ancestorSchemas.add(frame.zodSchema);
      frame.plan = planZodOpenApiSchema(frame.zodSchema);
    }
    let plan = frame.plan;
    if (frame.childIndex < plan.children.length) {
      let child = plan.children[frame.childIndex] as z.ZodType;
      frame.childIndex += 1;
      if (ancestorSchemas.has(child)) {
        throw new RangeError(
          'Zod schema cycle: a child schema is already an ancestor on the active stack.',
        );
      }
      stack.push({ zodSchema: child, childIndex: 0, childResults: [] });
      continue;
    }
    let built = plan.build(frame.childResults);
    ancestorSchemas.delete(frame.zodSchema);
    stack.pop();
    let parent = stack[stack.length - 1];
    if (parent) parent.childResults.push(built);
    else produced = built;
  }
  return produced;
}

// Re-export the load yaml helper for SSR
export { getYamlContent } from './load-yaml.js';

// Keep the other functions (fetch, getDereferenced...) unchanged for compatibility
export async function fetchYamlContent(webURL: string): Promise<any> {
  let response = await globalThis.fetch(webURL, {
    headers: { 'Content-Type': 'text/yaml' },
    mode: 'cors',
  });
  return parseSpecDocumentText(await response.text());
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
      let { getYamlContent } = await import('./load-yaml.js');
      openapiDocument = await getYamlContent(
        params.callSiteURL,
        params.relativePathToSpecFile
      );
    }

    return await dereferenceOpenApiDocument(openapiDocument);
  } catch (error: any) {
    throw new Error(`Error reading OpenAPI document: ${error?.message || ''}`);
  }
}
