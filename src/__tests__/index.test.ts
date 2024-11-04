import { z } from 'zod';
import {
  makeSchemaRequired,
  openAPISchemaToZod,
  applyConditionalRequirements,
  zodToOpenAPISchema,
} from '../';
import { loadAndResolveYAML } from '../openapi-spec-parser';

describe('makeSchemaRequired', () => {
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

    let transformedSchema = makeSchemaRequired(baseSchema, config);

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
      warrantyPeriod: '2 years',
    };

    let invalidDataMissingName = {
      category: {
        subcategories: [{ items: ['iPhone', 'Samsung Galaxy'] }],
      },
      type: 'electronics',
      warrantyPeriod: '2 years',
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
    expect(() => transformedSchema.parse(invalidDataMissingName))
      .toThrowErrorMatchingInlineSnapshot(`
        "[
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
        ]"
      `);

    expect(() => transformedSchema.parse(invalidDataItems))
      .toThrowErrorMatchingInlineSnapshot(`
        "[
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
        ]"
      `);

    // TODO: Update code after evaluating the case of list of objects at top level
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

    let anotherTransformedSchema = makeSchemaRequired(
      z.array(baseSchema),
      anotherConfig
    );

    expect(() =>
      anotherTransformedSchema.parse(anotherValidData)
    ).not.toThrow();

    expect(() => anotherTransformedSchema.parse(anotherInValidData)).toThrow();

    let dataLoadedFromYAML = await loadAndResolveYAML(
      import.meta.url,
      '../fixtures/base-schema.yml'
    );
    let dataZodSchema = openAPISchemaToZod(
      // @ts-ignore
      dataLoadedFromYAML['components']['schemas']['Category']
    );

    let yetAnotherTransformedSchema = makeSchemaRequired(dataZodSchema, config);

    expect(() =>
      yetAnotherTransformedSchema.parse(validData['category'])
    ).not.toThrow();

    expect(() =>
      yetAnotherTransformedSchema.parse(invalidDataMissingName['category'])
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

    const transformedSchema = makeSchemaRequired(baseSchema, config);

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

    const transformedSchema = makeSchemaRequired(baseSchema, config);

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
      makeSchemaRequired(invalidSchema, config)
    ).toThrowErrorMatchingInlineSnapshot(
      `"The given schema must be a Zod object."`
    );
  });

  it('should return the schema as it is when config is not an object', () => {
    const baseSchema = z.object({
      name: z.string().optional(),
    });

    // @ts-ignore
    const config = [];
    // @ts-ignore
    const transformedSchema = makeSchemaRequired(baseSchema, config);

    expect(transformedSchema).toBeInstanceOf(z.ZodObject);
    // @ts-ignore
    expect(transformedSchema.shape.name).toBeInstanceOf(z.ZodOptional);
  });
});

describe('openAPISchemaToZod', () => {
  it('should convert OpenAPI string schema to Zod string schema', () => {
    const openAPISchema = { type: 'string' };
    const zodSchema = openAPISchemaToZod(openAPISchema);
    expect(zodSchema).toBeInstanceOf(z.ZodString);
  });

  it('should convert OpenAPI number schema to Zod number schema', () => {
    const openAPISchema = { type: 'number' };
    const zodSchema = openAPISchemaToZod(openAPISchema);
    expect(zodSchema).toBeInstanceOf(z.ZodNumber);
  });

  it('should convert OpenAPI boolean schema to Zod boolean schema', () => {
    const openAPISchema = { type: 'boolean' };
    const zodSchema = openAPISchemaToZod(openAPISchema);
    expect(zodSchema).toBeInstanceOf(z.ZodBoolean);
  });

  it('should convert OpenAPI array schema to Zod array schema', () => {
    const openAPISchema = { type: 'array', items: { type: 'string' } };
    const zodSchema = openAPISchemaToZod(
      openAPISchema
    ) as z.ZodArray<z.ZodString>;
    expect(zodSchema).toBeInstanceOf(z.ZodArray);
    expect(zodSchema.element).toBeInstanceOf(z.ZodString);
  });

  it('should convert OpenAPI object schema to Zod object schema', () => {
    const openAPISchema = {
      type: 'object',
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
    }>;
    expect(zodSchema).toBeInstanceOf(z.ZodObject);
    expect(zodSchema.shape.name).toBeInstanceOf(z.ZodString);
    expect(zodSchema.shape.age).toBeInstanceOf(z.ZodNumber);
  });

  it('should convert OpenAPI schema with $ref to another component using openapi-spec-parser', async () => {
    let dataLoadedFromYAML = await loadAndResolveYAML(
      import.meta.url,
      '../fixtures/base-schema.yml'
    );
    let zodSchema = openAPISchemaToZod(
      // @ts-ignore
      dataLoadedFromYAML.components.schemas.Category
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

describe('applyConditionalRequirements', () => {
  it('should apply conditional requirements based on the config', () => {
    const schema = z.object({
      name: z.string().optional(),
      age: z.number().optional(),
    });

    const config = {
      name: {
        requiredIf: (data: any) => data.age > 18,
      },
    };

    const data = { age: 20 };
    const updatedSchema = applyConditionalRequirements(schema, config, data);

    expect(() => updatedSchema.parse({ name: 'John', age: 20 })).not.toThrow();
    expect(() => updatedSchema.parse({ age: 20 })).toThrow();
  });

  it('should handle non-object schema', () => {
    const schema = z.string();
    const config = {};
    const data = {};

    const result = applyConditionalRequirements(schema, config, data);

    expect(result).toBe(schema);
  });

  it('should handle non-object config', () => {
    const schema = z.object({
      name: z.string().optional(),
    });

    // @ts-ignore
    const config = [];
    const data = {};

    // @ts-ignore
    const result = applyConditionalRequirements(schema, config, data);

    expect(result).toBe(schema);
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
