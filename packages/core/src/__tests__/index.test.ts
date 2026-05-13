import { describe, it, expect } from 'vitest';

import { z } from 'zod';

import {
  getDereferencedOpenAPIDocument,
  openAPISchemaToZod,
} from '#utils/openapi';

import { transformSchema, makeConditionalSchemaTransformer } from '../';

describe('transformSchema', () => {
  it('should make properties required based on the config', async () => {
    let baseSchema = z.object({
      category: z
        .object({
          name: z.string().optional(),
          subcategories: z
            .array(
              z
                .object({
                  name: z.string().optional(),
                  items: z.array(z.string()).optional(),
                })
                .optional()
            )
            .optional(),
        })
        .optional(),
      type: z.string().optional(),
      warrantyPeriod: z.string().optional(),
    });

    let config = {
      category: {
        name: true,
        subcategories: {
          '*': {
            name: true,
            items: true,
          },
        },
      },
      type: true,
    };

    let transformedSchema = transformSchema(baseSchema, config);

    let validData = {
      category: {
        name: 'Electronics',
        subcategories: [
          {
            name: 'Phones',
            items: ['iPhone', 'Samsung Galaxy', 'Google Pixel'],
          },
        ],
      },
      type: 'electronics',
    };

    let invalidDataMissingCategoryName = {
      category: {
        subcategories: [
          {
            name: 'Phones',
            items: ['iPhone', 'Samsung Galaxy', 'Google Pixel'],
          },
        ],
      },
      type: 'electronics',
    };

    let invalidDataMissingSubCategoryName = {
      category: {
        subcategories: [{ items: ['iPhone', 'Samsung Galaxy'] }],
      },
      type: 'electronics',
    };

    let invalidDataItems = {
      category: {
        subcategories: [
          {
            name: 'Phones',
            items: '',
          },
        ],
      },
      type: 'electronics',
      warrantyPeriod: '2 years',
    };

    expect(() => transformedSchema.parse(validData)).not.toThrow();

    expect(() =>
      baseSchema.parse(invalidDataMissingSubCategoryName)
    ).not.toThrow();

    expect(() => transformedSchema.parse(invalidDataMissingSubCategoryName))
      .toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "category",
              "name"
            ],
            "message": "Invalid input: expected string, received undefined"
          },
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "category",
              "subcategories",
              0,
              "name"
            ],
            "message": "Invalid input: expected string, received undefined"
          }
        ]]
      `);

    // Re transforming the schema with different config
    // Here making warrantyPeriod required
    let reTransformedSchema = transformSchema(transformedSchema, {
      warrantyPeriod: true,
    });

    expect(() => reTransformedSchema.parse(validData))
      .toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "warrantyPeriod"
            ],
            "message": "Invalid input: expected string, received undefined"
          }
        ]]
      `);

    let reReTransformedSchema = transformSchema(reTransformedSchema, {
      category: {
        name: false,
      },
    });

    expect(() =>
      reReTransformedSchema.parse({
        ...invalidDataMissingCategoryName,
        warrantyPeriod: '2 years',
      })
    ).not.toThrow();

    expect(() => baseSchema.parse({})).not.toThrow();
    expect(() =>
      baseSchema.parse({
        category: {
          subcategories: [{ items: [] }],
        },
      })
    ).not.toThrow();
    expect(() => baseSchema.parse(invalidDataItems)).toThrow();
    expect(() => transformedSchema.parse(invalidDataItems))
      .toThrowErrorMatchingInlineSnapshot(`
        [ZodError: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "category",
              "name"
            ],
            "message": "Invalid input: expected string, received undefined"
          },
          {
            "expected": "array",
            "code": "invalid_type",
            "path": [
              "category",
              "subcategories",
              0,
              "items"
            ],
            "message": "Invalid input: expected array, received string"
          }
        ]]
      `);

    let anotherValidData = [
      {
        category: {
          name: 'Electronics',
          subcategories: [
            { name: 'Phones', items: ['iPhone', 'Samsung Galaxy'] },
          ],
        },
        type: 'electronics',
        warrantyPeriod: '2 years',
      },
    ];

    let anotherInValidData = [
      {
        category: {
          name: 'Electronics',
          subcategories: [{ name: 'Phones' }],
        },
        type: 'electronics',
        warrantyPeriod: '2 years',
      },
    ];

    let anotherConfig = {
      '*': {
        category: {
          name: true,
          subcategories: {
            '*': {
              name: true,
              items: true,
            },
          },
        },
        type: true,
      },
    };

    let anotherTransformedSchema = transformSchema(
      z.array(baseSchema),
      anotherConfig
    );

    expect(() =>
      anotherTransformedSchema.parse(anotherValidData)
    ).not.toThrow();

    expect(() => anotherTransformedSchema.parse(anotherInValidData)).toThrow();

    let dereferencedOpenAPIDocument = await getDereferencedOpenAPIDocument({
      location: 'filesystem',
      callSiteURL: import.meta.url,
      relativePathToSpecFile: '../fixtures/base-schema.yml',
    });

    let dataZodSchema = openAPISchemaToZod(
      // @ts-ignore
      dereferencedOpenAPIDocument['components']['schemas']['Category']
    );

    let yetAnotherTransformedSchema = transformSchema(dataZodSchema, config);

    expect(() =>
      yetAnotherTransformedSchema.parse(validData['category'])
    ).not.toThrow();

    expect(() =>
      yetAnotherTransformedSchema.parse(
        invalidDataMissingSubCategoryName['category']
      )
    ).toThrow();

    expect(() =>
      yetAnotherTransformedSchema.parse(invalidDataItems['category'])
    ).toThrow();
  });

  it('should handle array of objects at top level', () => {
    const baseSchema = z.array(
      z.object({
        name: z.string().optional(),
        age: z.number().optional(),
      })
    );

    const config = {
      '*': {
        name: true,
      },
    };

    const transformedSchema = transformSchema(baseSchema, config);

    const validData = [{ name: 'John', age: 30 }];
    const invalidData = [{ age: 30 }];

    expect(() => transformedSchema.parse(validData)).not.toThrow();
    expect(() => transformedSchema.parse(invalidData)).toThrow();
  });

  it('should handle nested objects with arrays', () => {
    const baseSchema = z.object({
      category: z
        .object({
          name: z.string().optional(),
          subcategories: z
            .array(
              z
                .object({
                  name: z.string().optional(),
                  items: z.array(z.string()).optional(),
                })
                .optional()
            )
            .optional(),
        })
        .optional(),
    });

    const config = {
      category: {
        subcategories: {
          '*': {
            items: true,
          },
        },
      },
    };

    const transformedSchema = transformSchema(baseSchema, config);

    const validData = {
      category: {
        subcategories: [
          {
            items: ['item1', 'item2'],
          },
        ],
      },
    };

    const invalidData = {
      category: {
        subcategories: [
          {
            name: 'subcategory1',
          },
        ],
      },
    };

    expect(() => transformedSchema.parse(validData)).not.toThrow();
    expect(() => transformedSchema.parse(invalidData)).toThrow();
  });

  it('should handle invalid schema type', () => {
    const invalidSchema = z.string();
    const config = false;

    expect(() =>
      transformSchema(invalidSchema, config)
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: The given schema must be a Zod object.]`
    );
  });

  it('should return the schema as it is when config is not an object', () => {
    const baseSchema = z.object({
      name: z.string().optional(),
    });

    // @ts-ignore
    const config = [];
    // @ts-ignore
    const transformedSchema = transformSchema(baseSchema, config);

    expect(transformedSchema).toBeInstanceOf(z.ZodObject);
    // @ts-ignore
    expect(transformedSchema.shape.name).toBeInstanceOf(z.ZodOptional);
  });
});

describe('makeConditionalSchemaTransformer', () => {
  it('should apply conditional requirements based on the config', () => {
    const schema = z.object({
      firstName: z.string().optional(),
      secondName: z.string().optional(),
      parentContactNumber: z.number().optional(),
      age: z.number().optional(),
      address: z
        .object({
          street: z.string().optional(),
          city: z.string().optional(),
        })
        .optional(),
      title: z.string().optional(),
    });

    const config = {
      parentContactNumber: {
        requiredIf: (data: any) => data.age < 18,
      },
      age: true,
      secondName: (data: any) => !!data.firstName,
    };

    let firstNameRequiredData = {
      firstName: 'Mario',
      age: 17,
    };
    let secondNameRequiredData = {
      firstName: 'Peram',
      age: 24,
    };

    expect(() =>
      makeConditionalSchemaTransformer(firstNameRequiredData)(
        schema,
        config
      ).run()
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "string",
          "code": "invalid_type",
          "path": [
            "secondName"
          ],
          "message": "Invalid input: expected string, received undefined"
        },
        {
          "expected": "number",
          "code": "invalid_type",
          "path": [
            "parentContactNumber"
          ],
          "message": "Invalid input: expected number, received undefined"
        }
      ]]
    `);

    expect(() =>
      makeConditionalSchemaTransformer(secondNameRequiredData)(
        schema,
        config
      ).run()
    ).toThrowErrorMatchingInlineSnapshot(`
      [ZodError: [
        {
          "expected": "string",
          "code": "invalid_type",
          "path": [
            "secondName"
          ],
          "message": "Invalid input: expected string, received undefined"
        }
      ]]
    `);
    expect(() =>
      makeConditionalSchemaTransformer({
        ...secondNameRequiredData,
        age: 37,
        secondName: 'Sathyam',
      })(schema, config).run()
    ).not.toThrow();
  });

  it('should handle non-object schema', () => {
    const schema = z.string();
    const config = {};
    const data = {};

    const result = makeConditionalSchemaTransformer(data)(schema, config);

    expect(result.schema).toBe(schema);
  });

  it('should parse primitive schema through the initial runner', () => {
    let transformer = makeConditionalSchemaTransformer('hello')(z.string(), {});
    expect(transformer.run()).toBe('hello');
  });

  it('should returns a result with updatedSchema, runner, staticConfig', () => {
    const schema = z.object({
      name: z.string().optional(),
      age: z.number().optional(),
      canBuyAlcohol: z.boolean().optional(),
    });

    const config = {
      name: true,
      canBuyAlcohol: {
        requiredIf: (data: any) => data.age >= 18,
      },
    };
    const data = {
      name: 'Peram',
      age: 37,
    };

    const result = makeConditionalSchemaTransformer(data)(schema, config);

    expect(result).toMatchInlineSnapshot(`
      {
        "run": [Function],
        "schema": ZodObject {
          "decode": [Function],
          "decodeAsync": [Function],
          "def": {
            "shape": {
              "age": ZodOptional {
                "decode": [Function],
                "decodeAsync": [Function],
                "def": {
                  "innerType": ZodNumber {
                    "decode": [Function],
                    "decodeAsync": [Function],
                    "def": {
                      "checks": [],
                      "type": "number",
                    },
                    "encode": [Function],
                    "encodeAsync": [Function],
                    "format": null,
                    "isFinite": true,
                    "isInt": false,
                    "maxValue": Infinity,
                    "minValue": -Infinity,
                    "optional": [Function],
                    "parse": [Function],
                    "parseAsync": [Function],
                    "safeDecode": [Function],
                    "safeDecodeAsync": [Function],
                    "safeEncode": [Function],
                    "safeEncodeAsync": [Function],
                    "safeParse": [Function],
                    "safeParseAsync": [Function],
                    "spa": [Function],
                    "toJSONSchema": [Function],
                    "type": "number",
                  },
                  "type": "optional",
                },
                "encode": [Function],
                "encodeAsync": [Function],
                "parse": [Function],
                "parseAsync": [Function],
                "safeDecode": [Function],
                "safeDecodeAsync": [Function],
                "safeEncode": [Function],
                "safeEncodeAsync": [Function],
                "safeParse": [Function],
                "safeParseAsync": [Function],
                "spa": [Function],
                "toJSONSchema": [Function],
                "type": "optional",
                "unwrap": [Function],
              },
              "canBuyAlcohol": ZodBoolean {
                "decode": [Function],
                "decodeAsync": [Function],
                "def": {
                  "type": "boolean",
                },
                "encode": [Function],
                "encodeAsync": [Function],
                "optional": [Function],
                "parse": [Function],
                "parseAsync": [Function],
                "safeDecode": [Function],
                "safeDecodeAsync": [Function],
                "safeEncode": [Function],
                "safeEncodeAsync": [Function],
                "safeParse": [Function],
                "safeParseAsync": [Function],
                "spa": [Function],
                "toJSONSchema": [Function],
                "type": "boolean",
              },
              "name": ZodString {
                "base64": [Function],
                "base64url": [Function],
                "cidrv4": [Function],
                "cidrv6": [Function],
                "cuid": [Function],
                "cuid2": [Function],
                "date": [Function],
                "datetime": [Function],
                "decode": [Function],
                "decodeAsync": [Function],
                "def": {
                  "type": "string",
                },
                "duration": [Function],
                "e164": [Function],
                "email": [Function],
                "emoji": [Function],
                "encode": [Function],
                "encodeAsync": [Function],
                "format": null,
                "guid": [Function],
                "ipv4": [Function],
                "ipv6": [Function],
                "jwt": [Function],
                "ksuid": [Function],
                "maxLength": null,
                "minLength": null,
                "nanoid": [Function],
                "optional": [Function],
                "parse": [Function],
                "parseAsync": [Function],
                "safeDecode": [Function],
                "safeDecodeAsync": [Function],
                "safeEncode": [Function],
                "safeEncodeAsync": [Function],
                "safeParse": [Function],
                "safeParseAsync": [Function],
                "spa": [Function],
                "time": [Function],
                "toJSONSchema": [Function],
                "type": "string",
                "ulid": [Function],
                "url": [Function],
                "uuid": [Function],
                "uuidv4": [Function],
                "uuidv6": [Function],
                "uuidv7": [Function],
                "xid": [Function],
              },
            },
            "type": "object",
          },
          "encode": [Function],
          "encodeAsync": [Function],
          "parse": [Function],
          "parseAsync": [Function],
          "safeDecode": [Function],
          "safeDecodeAsync": [Function],
          "safeEncode": [Function],
          "safeEncodeAsync": [Function],
          "safeParse": [Function],
          "safeParseAsync": [Function],
          "spa": [Function],
          "toJSONSchema": [Function],
          "type": "object",
        },
        "staticConfig": {
          "name": true,
        },
      }
    `);

    expect(result.staticConfig).toMatchInlineSnapshot(`
      {
        "name": true,
      }
    `);
  });

  it('should handle non-object config', () => {
    const schema = z.object({
      name: z.string().optional(),
    });

    // @ts-ignore
    const config = [];
    const data = {};

    // @ts-ignore
    const result = makeConditionalSchemaTransformer(data)(schema, config);

    expect(result.schema).toBe(schema);
  });
});
