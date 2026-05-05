import yaml from 'js-yaml';

import { z } from 'zod';

export function openAPISchemaToZod(
  schema: any,
  propertyKey: string = '',
  required: string[] = []
): z.ZodType {
  if (schema.type === 'string') {
    let zodSchema: z.ZodType = z.string();
    if (schema.format === 'email') {
      zodSchema = z.string().email();
    }

    return required.includes(propertyKey) ? zodSchema : zodSchema.optional();
  } else if (schema.type === 'number') {
    let zodSchema: z.ZodType = z.number();
    return required.includes(propertyKey) ? zodSchema : zodSchema.optional();
  } else if (schema.type === 'integer') {
    let zodSchema: z.ZodType = z.number().int();
    return required.includes(propertyKey) ? zodSchema : zodSchema.optional();
  } else if (schema.type === 'boolean') {
    let zodSchema: z.ZodType = z.boolean();
    return required.includes(propertyKey) ? zodSchema : zodSchema.optional();
  } else if (schema.type === 'array') {
    let itemsSchema: z.ZodType = z.any();
    if (schema.items) {
      itemsSchema = openAPISchemaToZod(schema.items, propertyKey, required);
    }

    return required.includes(propertyKey)
      ? z.array(itemsSchema)
      : z.array(itemsSchema.optional());
  } else if (schema.type === 'object') {
    const properties = schema.properties || {};
    const requiredProperties = schema.required || [];
    const shape = Object.fromEntries(
      Object.entries(properties).map((entry) => {
        let [key, value] = entry;
        let zodSchema = openAPISchemaToZod(value, key, requiredProperties);
        if (!requiredProperties.includes(key)) {
          zodSchema = zodSchema.optional();
        }
        return [key, zodSchema];
      })
    );
    return z.object(shape);
  }
  return z.any();
}

export function zodToOpenAPISchema(schema: any): any {
  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  } else if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  } else if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  } else if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToOpenAPISchema(schema.element) };
  } else if (schema instanceof z.ZodObject) {
    const properties = Object.fromEntries(
      Object.entries(schema.shape).map(([key, value]) => {
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

export type OpenAPISpecParams =
  | ServerOpenAPISpecParams
  | BrowserOpenAPISpecParams;
export async function getDereferencedOpenAPIDocument(
  params: OpenAPISpecParams
) {
  let openapiDocument = JSON.stringify({});

  let isNodeEnvDetected = globalThis.process?.versions?.node;

  try {
    if (params.location === 'web') {
      openapiDocument = (await fetchYamlContent(params.webURL)) as string;
    } else if (params.location === 'filesystem' || isNodeEnvDetected) {
      let { getYamlContent } = await import('./load-yaml.ts');

      openapiDocument = await getYamlContent(
        params.callSiteURL,
        params.relativePathToSpecFile
      );
    }
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
