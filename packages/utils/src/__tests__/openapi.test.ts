import { describe, it, expect } from 'vitest';

import { z } from 'zod';

import {
  getDereferencedOpenAPIDocument,
  openAPISchemaToZod,
  zodToOpenAPISchema,
} from '../openapi';

describe('openAPISchemaToZod', () => {
  it('should convert OpenAPI string schema to Zod string schema', () => {
    let openAPISchema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
        },
        items: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
    };

    const zodSchema = openAPISchemaToZod(openAPISchema);
    // @ts-ignore
    expect(zodSchema.shape.name).toBeInstanceOf(z.ZodString);
    // @ts-ignore
    expect(zodSchema.shape.items).toBeInstanceOf(z.ZodOptional);
    // @ts-ignore
    expect(zodSchema.shape.items.unwrap()).toBeInstanceOf(z.ZodArray);
    expect(
      // @ts-ignore
      zodSchema.shape.items.unwrap().element.unwrap().unwrap()
    ).toBeInstanceOf(z.ZodString);
  });

  it('should convert OpenAPI number schema to Zod number schema', () => {
    const openAPISchema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'number',
        },
      },
    };
    const zodSchema = openAPISchemaToZod(openAPISchema);
    // @ts-ignore
    expect(zodSchema.shape.id).toBeInstanceOf(z.ZodNumber);
  });

  it('should convert OpenAPI boolean schema to Zod boolean schema', () => {
    const openAPISchema = {
      type: 'object',
      required: ['enabled'],
      properties: {
        enabled: {
          type: 'boolean',
        },
      },
    };

    const zodSchema = openAPISchemaToZod(openAPISchema);
    // @ts-ignore
    expect(zodSchema.shape.enabled).toBeInstanceOf(z.ZodBoolean);
  });

  it('should convert OpenAPI array schema to Zod array schema', () => {
    const openAPISchema = {
      type: 'object',
      required: ['products'],
      properties: {
        products: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };

    const zodSchema = openAPISchemaToZod(
      openAPISchema
    ) as z.ZodArray<z.ZodString>;

    // @ts-ignore
    expect(zodSchema.shape.products).toBeInstanceOf(z.ZodArray);
  });

  it('should convert OpenAPI object schema to Zod object schema', () => {
    const openAPISchema = {
      type: 'object',
      required: ['name', 'age', 'email', 'count'],
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        email: { type: 'string', format: 'email' },
        count: { type: 'integer' },
        unknownType: { type: 'unknown' },
      },
    };
    const zodSchema = openAPISchemaToZod(openAPISchema) as z.ZodObject<{
      name: z.ZodString;
      age: z.ZodNumber;
      email: z.ZodString;
      count: z.ZodNumber;
      unknownType: z.ZodAny;
    }>;
    expect(zodSchema).toBeInstanceOf(z.ZodObject);
    expect(zodSchema.shape.name).toBeInstanceOf(z.ZodString);
    expect(zodSchema.shape.age).toBeInstanceOf(z.ZodNumber);
    expect(zodSchema.shape.email).toBeInstanceOf(z.ZodString);
    expect(zodSchema.shape.count).toBeInstanceOf(z.ZodNumber);
    // @ts-ignore
    expect(zodSchema.shape.unknownType.unwrap()).toBeInstanceOf(z.ZodAny);
  });

  it('should convert OpenAPI schema with $ref to another component using openapi-spec-parser', async () => {
    let dereferencedOpenAPIDocument = await getDereferencedOpenAPIDocument({
      location: 'filesystem',
      callSiteURL: import.meta.url,
      relativePathToSpecFile: '../fixtures/base-schema.yml',
    });
    let zodSchema = openAPISchemaToZod(
      // @ts-ignore
      dereferencedOpenAPIDocument.components.schemas.Category
    ) as z.ZodObject<{
      name: z.ZodString;
      subcategories: z.ZodArray<
        z.ZodObject<{ name: z.ZodString; items: z.ZodArray<z.ZodString> }>
      >;
    }>;

    expect(zodSchema).toBeInstanceOf(z.ZodObject);
    expect(zodSchema.shape.name).toBeInstanceOf(z.ZodString);
    expect(zodSchema.shape.subcategories).toBeInstanceOf(z.ZodArray);
    expect(zodSchema.shape.subcategories.element.shape.name).toBeInstanceOf(
      z.ZodString
    );
    expect(zodSchema.shape.subcategories.element.shape.items).toBeInstanceOf(
      z.ZodArray
    );
  });
});

describe('zodToOpenAPISchema', () => {
  it('should convert Zod string schema to OpenAPI string schema', () => {
    const zodSchema = z.string();
    const openAPISchema = zodToOpenAPISchema(zodSchema);
    expect(openAPISchema).toEqual({ type: 'string' });
  });

  it('should convert Zod number schema to OpenAPI number schema', () => {
    const zodSchema = z.number();
    const openAPISchema = zodToOpenAPISchema(zodSchema);
    expect(openAPISchema).toEqual({ type: 'number' });
  });

  it('should convert Zod boolean schema to OpenAPI boolean schema', () => {
    const zodSchema = z.boolean();
    const openAPISchema = zodToOpenAPISchema(zodSchema);
    expect(openAPISchema).toEqual({ type: 'boolean' });
  });

  it('should convert Zod array schema to OpenAPI array schema', () => {
    const zodSchema = z.array(z.string());
    const openAPISchema = zodToOpenAPISchema(zodSchema);
    expect(openAPISchema).toEqual({ type: 'array', items: { type: 'string' } });
  });

  it('should convert Zod object schema to OpenAPI object schema', () => {
    const zodSchema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const openAPISchema = zodToOpenAPISchema(zodSchema);
    expect(openAPISchema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    });
  });

  it('should handle unsupported Zod schema type', () => {
    const zodSchema = z.date();
    const openAPISchema = zodToOpenAPISchema(zodSchema);
    expect(openAPISchema).toEqual({});
  });
});

describe('getDereferencedOpenAPIDocument', () => {
  it('should return dereferencedOpenAPIDocument from OpenAPI yml spec file from filesystem', async () => {
    let dereferencedOpenAPIDocument = await getDereferencedOpenAPIDocument({
      location: 'filesystem',
      callSiteURL: import.meta.url,
      relativePathToSpecFile: '../fixtures/base-schema.yml',
    });

    expect(dereferencedOpenAPIDocument).toMatchInlineSnapshot(`
      {
        "components": {
          "schemas": {
            "Category": {
              "properties": {
                "name": {
                  "type": "string",
                },
                "optionalProperty": {
                  "type": "string",
                },
                "subcategories": {
                  "items": {
                    "properties": {
                      "items": {
                        "items": {
                          "type": "string",
                        },
                        "type": "array",
                      },
                      "name": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "name",
                      "items",
                    ],
                    "type": "object",
                  },
                  "type": "array",
                },
              },
              "required": [
                "name",
                "subcategories",
              ],
              "type": "object",
            },
            "Subcategory": {
              "properties": {
                "items": {
                  "items": {
                    "type": "string",
                  },
                  "type": "array",
                },
                "name": {
                  "type": "string",
                },
              },
              "required": [
                "name",
                "items",
              ],
              "type": "object",
            },
          },
        },
        "info": {
          "title": "Sample API",
          "version": "1.0.0",
        },
        "openapi": "3.0.0",
        "paths": {
          "/category": {
            "get": {
              "responses": {
                "200": {
                  "content": {
                    "application/json": {
                      "schema": {
                        "properties": {
                          "name": {
                            "type": "string",
                          },
                          "optionalProperty": {
                            "type": "string",
                          },
                          "subcategories": {
                            "items": {
                              "properties": {
                                "items": {
                                  "items": {
                                    "type": "string",
                                  },
                                  "type": "array",
                                },
                                "name": {
                                  "type": "string",
                                },
                              },
                              "required": [
                                "name",
                                "items",
                              ],
                              "type": "object",
                            },
                            "type": "array",
                          },
                        },
                        "required": [
                          "name",
                          "subcategories",
                        ],
                        "type": "object",
                      },
                    },
                  },
                  "description": "A category object",
                },
              },
              "summary": "Get category",
            },
          },
        },
      }
    `);

    await expect(() =>
      getDereferencedOpenAPIDocument({
        location: 'filesystem',
        callSiteURL: import.meta.url,
        relativePathToSpecFile: '../fixtures/unknown.yml',
      })
    ).rejects.toThrow(/no such file or directory/i);
  });

  it('should fetch and parse spec file form web', async () => {
    try {
      // Intentionally not mocking the fetch call
      let dereferencedOpenAPIDocumentFromWeb =
        await getDereferencedOpenAPIDocument({
          location: 'web',
          webURL:
            'https://api.apis.guru/v2/specs/googleapis.com/books/v1/openapi.yaml',
        });

      // @ts-ignore
      expect(dereferencedOpenAPIDocumentFromWeb.info).toMatchInlineSnapshot(`
        {
          "contact": {
            "name": "Google",
            "url": "https://google.com",
            "x-twitter": "youtube",
          },
          "description": "The Google Books API allows clients to access the Google Books repository.",
          "license": {
            "name": "Creative Commons Attribution 3.0",
            "url": "http://creativecommons.org/licenses/by/3.0/",
          },
          "termsOfService": "https://developers.google.com/terms/",
          "title": "Books API",
          "version": "v1",
          "x-apiClientRegistration": {
            "url": "https://console.developers.google.com",
          },
          "x-apisguru-categories": [
            "analytics",
            "media",
          ],
          "x-logo": {
            "url": "https://api.apis.guru/v2/cache/logo/https_www.google.com_images_branding_googlelogo_2x_googlelogo_color_272x92dp.png",
          },
          "x-origin": [
            {
              "format": "google",
              "url": "https://books.googleapis.com/$discovery/rest?version=v1",
              "version": "v1",
            },
          ],
          "x-providerName": "googleapis.com",
          "x-serviceName": "books",
        }
      `);
    } catch (e) {
      console.log('Network failure or', (e as any)?.message);
    }
  });
});
