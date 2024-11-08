import SwaggerParser from '@apidevtools/swagger-parser';
import yaml from 'js-yaml';

import { z, ZodTypeAny, ZodArray, ZodObject } from 'zod';

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

export async function getDereferencedOpenAPIDocument(
  fileURL: string,
  relativePath: string
) {
  try {
    let fs = await import('node:fs');
    let path = await import('node:path');
    let { fileURLToPath } = await import('node:url');
    let { dirname } = path;
    let fileURLPath = fileURLToPath(fileURL);
    let callerDirectoryName = dirname(fileURLPath);
    let yamlFilePath = path.resolve(callerDirectoryName, relativePath);
    const openapiDocument = yaml.load(
      fs.readFileSync(yamlFilePath, 'utf8')
    ) as string;

    const dereferenced = await SwaggerParser.dereference(openapiDocument);

    return dereferenced;
  } catch (error) {
    throw new Error(
      `Error reading OpenAPI document: ${(error as any)?.message || ''}`
    );
  }
}
