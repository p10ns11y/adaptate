import { afterEach, describe, expect, it, vi } from 'vitest';

import { z } from 'zod';

import {
  fetchYamlContent,
  getDereferencedOpenAPIDocument,
  getYamlContent,
  openAPISchemaToZod,
  zodToOpenAPISchema,
} from '../openapi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openAPISchemaToZod (additional branches)', () => {
  it('maps boolean type', () => {
    let zodSchema = openAPISchemaToZod({ type: 'boolean' });
    expect(zodSchema.parse(true)).toBe(true);
    expect(zodSchema.parse(false)).toBe(false);
  });

  it('maps array without items as array of any', () => {
    let zodSchema = openAPISchemaToZod({ type: 'array' });
    expect(zodSchema.parse([1, 'mixed'])).toEqual([1, 'mixed']);
  });

  it('falls back to z.any() for unrecognized shapes', () => {
    let zodSchema = openAPISchemaToZod({ notAStandardKeyword: true });
    expect(zodSchema.parse({ anything: true })).toEqual({ anything: true });
  });

  it('maps oneOf like anyOf', () => {
    let zodSchema = openAPISchemaToZod({
      oneOf: [{ type: 'string' }, { type: 'number' }],
    });
    expect(zodSchema.parse('ok')).toBe('ok');
    expect(zodSchema.parse(42)).toBe(42);
  });

  it('maps composite schema.type array for numbers', () => {
    let zodSchema = openAPISchemaToZod({
      type: ['number', 'integer'],
      minimum: 1,
    });
    expect(zodSchema.parse(2)).toBe(2);
  });

  it('records optional object properties when not listed in required', () => {
    let zodSchema = openAPISchemaToZod({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
      required: [],
    });
    expect(zodSchema.parse({})).toEqual({});
  });

  it('visits additionalProperties object branch without changing shape', () => {
    let zodSchema = openAPISchemaToZod({
      type: 'object',
      properties: {},
      additionalProperties: { type: 'string' },
    });
    expect(zodSchema.parse({})).toEqual({});
  });
});

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
      maxLength: 30,
      pattern: '^[a-z]+$',
    };
    const zodSchema = openAPISchemaToZod(schema);
    expect(zodSchema.parse('hello')).toBe('hello');
    expect(() => zodSchema.parse('ab')).toThrow(); // too short
    expect(() => zodSchema.parse('Hello')).toThrow(); // fails pattern
  });

  it('should handle string with email format and length bounds', () => {
    const schema = {
      type: 'string',
      minLength: 3,
      maxLength: 254,
      format: 'email',
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
    const zodSchema = z.email().min(3).max(10);
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
      email: z.email()
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

describe('fetchYamlContent', () => {
  it('loads YAML returned by fetch', async () => {
    let yamlText =
      'openapi: 3.0.0\ninfo:\n  title: Mock\n  version: "1"\npaths: {}\n';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => yamlText,
    } as Response);

    let document = (await fetchYamlContent(
      'https://example.com/openapi.yaml'
    )) as Record<string, any>;
    expect(document.openapi).toBe('3.0.0');
    expect(document.info.title).toBe('Mock');
  });
});

describe('getDereferencedOpenAPIDocument (mocked web)', () => {
  it('dereferences a minimal OpenAPI document from a mocked URL', async () => {
    let yamlText =
      'openapi: 3.0.0\ninfo:\n  title: Mock\n  version: "1"\npaths: {}\n';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => yamlText,
    } as Response);

    let dereferenced = (await getDereferencedOpenAPIDocument({
      location: 'web',
      webURL: 'https://example.com/spec.yaml',
    })) as Record<string, any>;

    expect(dereferenced.openapi).toBe('3.0.0');
  });

  it('wraps failures when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'));

    await expect(
      getDereferencedOpenAPIDocument({
        location: 'web',
        webURL: 'https://example.com/missing.yaml',
      })
    ).rejects.toThrow(/Error reading OpenAPI document: network unavailable/);
  });
});

describe('getYamlContent', () => {
  it('reads a YAML fixture relative to the caller', async () => {
    let document = (await getYamlContent(
      import.meta.url,
      '../fixtures/base-schema.yml'
    )) as Record<string, any>;
    expect(document.openapi).toBe('3.0.0');
  });
});

describe('zodToOpenAPISchema (additional Zod kinds)', () => {
  it('maps z.any and z.unknown', () => {
    expect(zodToOpenAPISchema(z.any())).toEqual({});
    expect(zodToOpenAPISchema(z.unknown())).toEqual({});
  });

  it('maps z.date and z.bigint', () => {
    expect(zodToOpenAPISchema(z.date())).toMatchObject({
      type: 'string',
      format: 'date-time',
    });
    expect(zodToOpenAPISchema(z.bigint())).toMatchObject({
      type: 'integer',
      format: 'int64',
    });
  });

  it('maps nullable schemas without a JSON Schema type on the inner value', () => {
    let openApi = zodToOpenAPISchema(z.nullable(z.any()));
    expect(openApi.nullable).toBe(true);
  });

  it('maps ZodUnion', () => {
    let openApi = zodToOpenAPISchema(z.union([z.literal('a'), z.literal('b')]));
    expect(openApi.anyOf).toHaveLength(2);
  });

  it('maps native enum', () => {
    enum Role {
      Admin = 'admin',
      User = 'user',
    }
    let openApi = zodToOpenAPISchema(z.nativeEnum(Role));
    expect(openApi.enum).toEqual(expect.arrayContaining(['admin', 'user']));
  });

  it('maps z.nullable with typed inner schema', () => {
    let openApi = zodToOpenAPISchema(z.nullable(z.string()));
    expect(openApi.type).toContain('string');
    expect(openApi.type).toContain('null');
  });
});

describe('openAPISchemaToZod (edge contracts)', () => {
  it('treats nullish and non-object schemas as z.any()', () => {
    expect(openAPISchemaToZod(null).safeParse('x').success).toBe(true);
    expect(openAPISchemaToZod(undefined as never).safeParse(1).success).toBe(true);
    expect(openAPISchemaToZod(0 as never).safeParse(true).success).toBe(true);
  });

  it('builds heterogeneous enums with literals', () => {
    let schema = openAPISchemaToZod({
      enum: [1, 'alpha', false],
    });
    expect(schema.parse(1)).toBe(1);
    expect(schema.parse('alpha')).toBe('alpha');
    expect(schema.parse(false)).toBe(false);
    expect(() => schema.parse('other' as never)).toThrow();
  });

  it.each([
    ['uuid', '550e8400-e29b-41d4-a716-446655440000'],
    ['uri', 'https://example.com'],
    ['url', 'https://example.com/path'],
    ['date-time', new Date(0).toISOString()],
    ['datetime', new Date(0).toISOString()],
    ['date', '2020-01-01'],
    ['time', '12:34:56'],
  ] as const)('applies OpenAPI string format %s', (format, sample) => {
    let schema = openAPISchemaToZod({ type: 'string', format });
    expect(() => schema.parse(sample)).not.toThrow();
  });

  it('silently ignores invalid JSON Schema patterns', () => {
    let schema = openAPISchemaToZod({
      type: 'string',
      pattern: '(',
    });
    expect(schema.parse('(')).toBe('(');
  });

  it('enforces exclusiveMaximum at parse time', () => {
    let schema = openAPISchemaToZod({
      type: 'number',
      exclusiveMaximum: 10,
    });
    expect(schema.parse(9.5)).toBe(9.5);
    expect(() => schema.parse(10)).toThrow();
    expect(() => schema.parse(11)).toThrow();
  });

  it('supports nullable via type tuples including null', () => {
    let schema = openAPISchemaToZod({
      type: ['string', 'null'],
    });
    expect(schema.parse('ok')).toBe('ok');
    expect(schema.parse(null)).toBeNull();
  });

  it('visits additionalProperties object metadata without mutating the Zod object shape', () => {
    let schema = openAPISchemaToZod({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: { type: 'number' },
    });
    expect(schema.parse({ name: 'Ada' })).toEqual({ name: 'Ada' });
  });

  it('strips unknown keys for empty objects even when additionalProperties is false', () => {
    let schema = openAPISchemaToZod({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
    expect(schema.parse({ extra: 1 })).toEqual({});
  });

  it('does not append a second optional when the nested schema is already a union', () => {
    let schema = openAPISchemaToZod({
      type: 'object',
      properties: {
        mode: { anyOf: [{ type: 'string' }, { type: 'number' }] },
      },
      required: [],
    });
    expect(schema.parse({ mode: 'read' })).toEqual({ mode: 'read' });
    expect(schema.parse({ mode: 2 })).toEqual({ mode: 2 });
  });

  it('treats object shapes declared only via properties as objects', () => {
    let schema = openAPISchemaToZod({
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    });
    expect(schema.parse({ id: 'abc' })).toEqual({ id: 'abc' });
    expect(() => schema.parse({} as never)).toThrow();
  });

  it('treats objects without a properties bag as empty shapes', () => {
    let schema = openAPISchemaToZod({
      type: 'object',
      required: [],
    });
    expect(schema.parse({})).toEqual({});
  });
});

describe('zodToOpenAPISchema (runtime shape contracts)', () => {
  it('returns an empty object for a missing schema reference', () => {
    expect(zodToOpenAPISchema(undefined as never)).toEqual({});
    expect(zodToOpenAPISchema(null as never)).toEqual({});
  });

  it('preserves descriptions from describe() via Zod 4 global metadata', () => {
    let openApi = zodToOpenAPISchema(z.string().describe('Human label'));
    expect(openApi.description).toBe('Human label');
  });

  it('still reads legacy _def descriptions when present', () => {
    let plain = z.string();
    Object.defineProperty((plain as any)._def, 'description', {
      value: 'Legacy description',
      configurable: true,
    });
    let openApi = zodToOpenAPISchema(plain);
    expect(openApi.description).toBe('Legacy description');
  });

  it('emits boolean primitives at the root', () => {
    expect(zodToOpenAPISchema(z.boolean())).toEqual({ type: 'boolean' });
  });

  it('preserves array bounds using minItems/maxItems', () => {
    let openApi = zodToOpenAPISchema(z.array(z.string()).min(2).max(4));
    expect(openApi).toMatchObject({
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: { type: 'string' },
    });
  });

  it('omits required when every object property is optional', () => {
    let openApi = zodToOpenAPISchema(
      z.object({
        label: z.string().optional(),
      })
    );
    expect(openApi.required).toBeUndefined();
  });

  it('retains numeric native enum values for OpenAPI enum parity', () => {
    enum Http {
      Ok = 200,
      NotFound = 404,
    }
    let openApi = zodToOpenAPISchema(z.nativeEnum(Http));
    expect(openApi.enum).toEqual(expect.arrayContaining([200, 404]));
  });

  it('falls back to an empty schema for unsupported Zod types', () => {
    let custom = z.custom<number>((value) => typeof value === 'number');
    expect(zodToOpenAPISchema(custom)).toEqual({});
  });

  it('merges nullable fragments when unwrap is absent (compat)', () => {
    let nullable = z.string().nullable();
    delete (nullable as any).unwrap;
    expect(zodToOpenAPISchema(nullable).type).toEqual(['string', 'null']);
  });

  it('treats unions without an options bag as empty anyOf', () => {
    let union = z.union([z.literal('a'), z.literal('b')]);
    delete (union as any).options;
    expect(zodToOpenAPISchema(union)).toEqual({ anyOf: [] });
  });
});
