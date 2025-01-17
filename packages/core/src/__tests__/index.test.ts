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
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": [
              "category",
              "name"
            ],
            "message": "Required"
          },
          {
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": [
              "category",
              "subcategories",
              0,
              "name"
            ],
            "message": "Required"
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
          "code": "invalid_type",
          "expected": "string",
          "received": "undefined",
          "path": [
            "warrantyPeriod"
          ],
          "message": "Required"
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
            "code": "invalid_type",
            "expected": "string",
            "received": "undefined",
            "path": [
              "category",
              "name"
            ],
            "message": "Required"
          },
          {
            "code": "invalid_type",
            "expected": "array",
            "received": "string",
            "path": [
              "category",
              "subcategories",
              0,
              "items"
            ],
            "message": "Expected array, received string"
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
    const config = {};

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
          "code": "invalid_type",
          "expected": "string",
          "received": "undefined",
          "path": [
            "secondName"
          ],
          "message": "Required"
        },
        {
          "code": "invalid_type",
          "expected": "number",
          "received": "undefined",
          "path": [
            "parentContactNumber"
          ],
          "message": "Required"
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
          "code": "invalid_type",
          "expected": "string",
          "received": "undefined",
          "path": [
            "secondName"
          ],
          "message": "Required"
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
          "_cached": null,
          "_def": {
            "catchall": ZodNever {
              "_def": {
                "typeName": "ZodNever",
              },
              "and": [Function],
              "array": [Function],
              "brand": [Function],
              "catch": [Function],
              "default": [Function],
              "describe": [Function],
              "isNullable": [Function],
              "isOptional": [Function],
              "nullable": [Function],
              "nullish": [Function],
              "optional": [Function],
              "or": [Function],
              "parse": [Function],
              "parseAsync": [Function],
              "pipe": [Function],
              "promise": [Function],
              "readonly": [Function],
              "refine": [Function],
              "refinement": [Function],
              "safeParse": [Function],
              "safeParseAsync": [Function],
              "spa": [Function],
              "superRefine": [Function],
              "transform": [Function],
            },
            "shape": [Function],
            "typeName": "ZodObject",
            "unknownKeys": "strip",
          },
          "and": [Function],
          "array": [Function],
          "augment": [Function],
          "brand": [Function],
          "catch": [Function],
          "default": [Function],
          "describe": [Function],
          "isNullable": [Function],
          "isOptional": [Function],
          "nonstrict": [Function],
          "nullable": [Function],
          "nullish": [Function],
          "optional": [Function],
          "or": [Function],
          "parse": [Function],
          "parseAsync": [Function],
          "pipe": [Function],
          "promise": [Function],
          "readonly": [Function],
          "refine": [Function],
          "refinement": [Function],
          "safeParse": [Function],
          "safeParseAsync": [Function],
          "spa": [Function],
          "superRefine": [Function],
          "transform": [Function],
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
