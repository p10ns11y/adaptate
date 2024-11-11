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
    let itemsSchema = z.any();
    if (schema.items) {
      // @ts-ignore
      itemsSchema = openAPISchemaToZod(schema.items, propertyKey, required);
    }

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

export async function fetchYamlContent(webURL: string) {
  let response = await globalThis.fetch(webURL, {
    headers: {
      'Content-Type': 'text/yaml',
    },
  });
  let openapiDocument = yaml.load(await response.text());

  return openapiDocument;
}

export type ServerOpenAPISpecParams = {
  environment: 'server';
  callSiteURL: string;
  relativePathToSpecFile: string;
};

export type BrowserOpenAPISpecParams = {
  environment: 'browser';
  webURL: string;
};

export type OpenAPISpecParams =
  | ServerOpenAPISpecParams
  | BrowserOpenAPISpecParams;
export async function getDereferencedOpenAPIDocument(
  params: OpenAPISpecParams
) {
  let openapiDocument = JSON.stringify({});

  let isNodeEnvDetected = globalThis.process?.versions?.node;

  // let isBrowserIntended = params.environment === 'browser';
  let isBrowserDetected = globalThis?.window?.document;

  try {
    if (params.environment === 'browser' && isBrowserDetected) {
      openapiDocument = (await fetchYamlContent(params.webURL)) as string;
    } else if (params.environment === 'server' && isNodeEnvDetected) {
      let { getYamlContent } = await import('./load-yaml.ts');

      openapiDocument = await getYamlContent(
        params.callSiteURL,
        params.relativePathToSpecFile
      );
    }
    // https://github.com/APIDevTools/json-schema-reader/blob/main/src/index.ts#L21
    // let SwaggerParser = await import('@apidevtools/swagger-parser');
    let SwaggerParser = await import('@apidevtools/json-schema-ref-parser');

    const dereferenced = await SwaggerParser.default.dereference(
      openapiDocument
    );

    return dereferenced;
  } catch (error) {
    throw new Error(
      `Error reading OpenAPI document: ${(error as any)?.message || ''}`
    );
  }
}
