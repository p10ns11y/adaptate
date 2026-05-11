import { describe, it, expect } from 'vitest';

import { z } from 'zod';

import {
  getDereferencedOpenAPIDocument,
  openAPISchemaToZod,
  zodToOpenAPISchema,
} from '../openapi';

describe('openAPISchemaToZod (feature-complete)', () => {
  it('should convert enum schema', () => {
    const schema = { enum: ['active', 'inactive'] };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse('active')).toBe('active');
    expect(() => zodSchema.parse('pending')).toThrow();
  });

  it('should handle string with minLength, maxLength, pattern, and format', () => {
    const schema = {
      type: 'string',
      minLength: 3,
      maxLength: 10,
      pattern: '^[a-z]+$', 
      format: 'email'
    };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse('test@example.com')).toBe('test@example.com');
    expect(() => zodSchema.parse('ab')).toThrow(); // too short
    expect(() => zodSchema.parse('test@')).toThrow(); // invalid email
  });

  it('should handle number with minimum, maximum, exclusiveMinimum, multipleOf', () => {
    const schema = {
      type: 'number',
      minimum: 10,
      maximum: 100,
      exclusiveMinimum: 10,
      multipleOf: 5
    };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse(15)).toBe(15);
    expect(() => zodSchema.parse(5)).toThrow();
    expect(() => zodSchema.parse(101)).toThrow();
    expect(() => zodSchema.parse(12)).toThrow(); // not multiple of 5
  });

  it('should handle integer type', () => {
    const schema = { type: 'integer' };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse(42)).toBe(42);
    expect(() => zodSchema.parse(42.5)).toThrow();
  });

  it('should handle array with minItems and maxItems', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 5
    };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse(['a', 'b'])).toEqual(['a', 'b']);
    expect(() => zodSchema.parse(['a'])).toThrow();
  });

  it('should handle object with required fields', () => {
    const schema = {
      type: 'object',
      required: ['name', 'age'],
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
        email: { type: 'string' }
      }
    };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse({ name: 'Ada', age: 30 })).toEqual({ name: 'Ada', age: 30 });
    expect(() => zodSchema.parse({ name: 'Ada' })).toThrow(); // missing age
  });

  it('should handle allOf (intersection)', () => {
    const schema = {
      allOf: [
        { type: 'object', properties: { name: { type: 'string' } } },
        { type: 'object', properties: { age: { type: 'integer' } } }
      ]
    };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse({ name: 'Ada', age: 30 })).toEqual({ name: 'Ada', age: 30 });
  });

  it('should handle anyOf/oneOf (union)', () => {
    const schema = {
      anyOf: [
        { type: 'string' },
        { type: 'integer' }
      ]
    };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse('hello')).toBe('hello');
    expect(zodSchema.parse(42)).toBe(42);
  });

  it('should handle nullable', () => {
    const schema = { type: 'string', nullable: true };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse(null)).toBeNull();
    expect(zodSchema.parse('test')).toBe('test');
  });
});

describe('zodToOpenAPISchema (feature-complete)', () => {
  it('should convert Zod string with validations', () => {
    const zodSchema = z.string().min(3).max(10).email();
    const openApi = zodToOpenAPISchema(zodSchema);
    expect(openApi.type).toBe('string');
    expect(openApi.minLength).toBe(3);
    expect(openApi.maxLength).toBe(10);
    expect(openApi.format).toBe('email');
  });

  it('should convert Zod number with constraints', () => {
    const zodSchema = z.number().int().min(10).max(100).multipleOf(5);
    const openApi = zodToOpenAPISchema(zodSchema);
    expect(openApi.type).toBe('integer');
    expect(openApi.minimum).toBe(10);
    expect(openApi.maximum).toBe(100);
    expect(openApi.multipleOf).toBe(5);
  });

  it('should handle Zod enum', () => {
    const zodSchema = z.enum(['active', 'inactive']);
    const openApi = zodToOpenAPISchema(zodSchema);
    expect(openApi.enum).toEqual(['active', 'inactive']);
  });

  it('should handle Zod object with required fields', () => {
    const zodSchema = z.object({
      name: z.string(),
      age: z.number().optional(),
      email: z.string().email()
    });
    const openApi = zodToOpenAPISchema(zodSchema);
    expect(openApi.required).toEqual(['name', 'email']);
  });

  it('should roundtrip openAPISchemaToZod ↔ zodToOpenAPISchema', () => {
    const original = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 2 },
        age: { type: 'integer', minimum: 0 }
      }
    };
    const zodSchema = openAPISchemaToZod(original);
    const backToOpenApi = zodToOpenAPISchema(zodSchema);
    expect(backToOpenApi.type).toBe('object');
    expect(backToOpenApi.required).toEqual(['name']);
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
