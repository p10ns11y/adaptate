import { describe, it, expect } from "vitest";

import { z } from "zod";

import {
  getDereferencedOpenAPIDocument,
  openAPISchemaToZod,
} from "#utils/openapi";

import { transformSchema, makeConditionalSchemaTransformer, type Config } from "../";
import { Readable } from "node:stream";
import { Effect } from "effect";
import { createAgUiPartialValidator, createStreamValidator } from "../stream";
import { fromAsyncIterable } from "../stream-incremental";
import { validateAgainstStandardSchemas } from "../standard";
import { createEffectStreamValidator } from "../effect";

describe("transformSchema", () => {
  it("should make properties required based on the config", async () => {
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
                .optional(),
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
          "*": {
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
        name: "Electronics",
        subcategories: [
          {
            name: "Phones",
            items: ["iPhone", "Samsung Galaxy", "Google Pixel"],
          },
        ],
      },
      type: "electronics",
    };

    let invalidDataMissingCategoryName = {
      category: {
        subcategories: [
          {
            name: "Phones",
            items: ["iPhone", "Samsung Galaxy", "Google Pixel"],
          },
        ],
      },
      type: "electronics",
    };

    let invalidDataMissingSubCategoryName = {
      category: {
        subcategories: [{ items: ["iPhone", "Samsung Galaxy"] }],
      },
      type: "electronics",
    };

    let invalidDataItems = {
      category: {
        subcategories: [
          {
            name: "Phones",
            items: "",
          },
        ],
      },
      type: "electronics",
      warrantyPeriod: "2 years",
    };

    expect(() => transformedSchema.parse(validData)).not.toThrow();

    expect(() =>
      baseSchema.parse(invalidDataMissingSubCategoryName),
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
        warrantyPeriod: "2 years",
      }),
    ).not.toThrow();

    expect(() => baseSchema.parse({})).not.toThrow();
    expect(() =>
      baseSchema.parse({
        category: {
          subcategories: [{ items: [] }],
        },
      }),
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
          name: "Electronics",
          subcategories: [
            { name: "Phones", items: ["iPhone", "Samsung Galaxy"] },
          ],
        },
        type: "electronics",
        warrantyPeriod: "2 years",
      },
    ];

    let anotherInValidData = [
      {
        category: {
          name: "Electronics",
          subcategories: [{ name: "Phones" }],
        },
        type: "electronics",
        warrantyPeriod: "2 years",
      },
    ];

    let anotherConfig = {
      "*": {
        category: {
          name: true,
          subcategories: {
            "*": {
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
      anotherConfig,
    );

    expect(() =>
      anotherTransformedSchema.parse(anotherValidData),
    ).not.toThrow();

    expect(() => anotherTransformedSchema.parse(anotherInValidData)).toThrow();

    let dereferencedOpenAPIDocument = await getDereferencedOpenAPIDocument({
      location: "filesystem",
      callSiteURL: import.meta.url,
      relativePathToSpecFile: "../fixtures/base-schema.yml",
    });

    let dataZodSchema = openAPISchemaToZod(
      // @ts-ignore
      dereferencedOpenAPIDocument["components"]["schemas"]["Category"],
    );

    let yetAnotherTransformedSchema = transformSchema(dataZodSchema, config);

    expect(() =>
      yetAnotherTransformedSchema.parse(validData["category"]),
    ).not.toThrow();

    expect(() =>
      yetAnotherTransformedSchema.parse(
        invalidDataMissingSubCategoryName["category"],
      ),
    ).toThrow();

    expect(() =>
      yetAnotherTransformedSchema.parse(invalidDataItems["category"]),
    ).toThrow();
  });

  it("requires a field after converting an OpenAPI object and calling transformSchema", () => {
    let recipe = openAPISchemaToZod({
      type: "object",
      properties: {
        title: { type: "string" },
        servings: { type: "integer" },
      },
    });
    let kitchen = transformSchema(recipe, { servings: true });
    expect(kitchen.parse({ title: "Pasta", servings: 2 })).toEqual({
      title: "Pasta",
      servings: 2,
    });
    expect(() => kitchen.parse({ title: "Pasta" })).toThrow();
  });

  it("should handle array of objects at top level", () => {

    const baseSchema = z.array(
      z.object({
        name: z.string().optional(),
        age: z.number().optional(),
      }),
    );

    const config = {
      "*": {
        name: true,
      },
    };

    const transformedSchema = transformSchema(baseSchema, config);

    const validData = [{ name: "John", age: 30 }];
    const invalidData = [{ age: 30 }];

    expect(() => transformedSchema.parse(validData)).not.toThrow();
    expect(() => transformedSchema.parse(invalidData)).toThrow();
  });

  it("should handle nested objects with arrays", () => {
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
                .optional(),
            )
            .optional(),
        })
        .optional(),
    });

    const config = {
      category: {
        subcategories: {
          "*": {
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
            items: ["item1", "item2"],
          },
        ],
      },
    };

    const invalidData = {
      category: {
        subcategories: [
          {
            name: "subcategory1",
          },
        ],
      },
    };

    expect(() => transformedSchema.parse(validData)).not.toThrow();
    expect(() => transformedSchema.parse(invalidData)).toThrow();
  });

  it("should handle invalid schema type", () => {
    const invalidSchema = z.string();
    const config = false;

    expect(() =>
      transformSchema(invalidSchema, config),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: The given schema must be a Zod object.]`,
    );
  });

  it("should return the schema as it is when config is not an object", () => {
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

describe("makeConditionalSchemaTransformer", () => {
  it("should apply conditional requirements based on the config", () => {
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
      firstName: "Mario",
      age: 17,
    };
    let secondNameRequiredData = {
      firstName: "Peram",
      age: 24,
    };

    expect(() =>
      makeConditionalSchemaTransformer(firstNameRequiredData)(
        schema,
        config,
      ).run(),
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
        config,
      ).run(),
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
        secondName: "Sathyam",
      })(schema, config).run(),
    ).not.toThrow();
  });

  it("should handle non-object schema", () => {
    const schema = z.string();
    const config = {};
    const data = {};

    const result = makeConditionalSchemaTransformer(data)(schema, config);

    expect(result.schema).toBe(schema);
  });

  it("should parse primitive schema through the initial runner", () => {
    let transformer = makeConditionalSchemaTransformer("hello")(z.string(), {});
    expect(transformer.run()).toBe("hello");
  });

  it("should returns a result with updatedSchema, runner, staticConfig", () => {
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
      name: "Peram",
      age: 37,
    };

    const result = makeConditionalSchemaTransformer(data)(schema, config);

    expect(result.run).toBeTypeOf("function");
    expect(result.schema).toBeInstanceOf(z.ZodObject);
    const missing = result.schema.safeParse({ age: 37 });
    expect(missing.error?.issues.map((issue) => issue.path)).toEqual([
      ["name"],
      ["canBuyAlcohol"],
    ]);
    expect(
      result.schema.safeParse({ ...data, canBuyAlcohol: true }).success,
    ).toBe(true);

    expect(result.staticConfig).toMatchInlineSnapshot(`
      {
        "name": true,
      }
    `);
  });

  it("should handle non-object config", () => {
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

describe("readme snippets", () => {
  it("checks the quickstart card against the inferred recipe type", () => {
    let recipe = z.object({ title: z.string(), servings: z.number() });
    type Recipe = z.infer<typeof recipe>;
    let card = { title: true } satisfies Config<Recipe>;
    let cardSchema = transformSchema(recipe.partial(), card);
    expect(cardSchema.parse({ title: "Pasta" })).toEqual({ title: "Pasta" });
    expect(cardSchema.safeParse({ title: "Pas" }).success).toBe(true);
    expect(cardSchema.safeParse({}).success).toBe(false);
    let kitchenSchema = transformSchema(recipe.partial(), {
      title: true,
      servings: true,
    });
    expect(kitchenSchema.safeParse({ title: "Pas" }).success).toBe(false);
  });

  it("reads a cutoff tool call that JSON.parse rejects", () => {
    let recipe = z.object({ title: z.string(), servings: z.number() });
    let push = createAgUiPartialValidator(recipe, { card: { title: true } });
    let cutoff = '{"title":"Pas';
    expect(() => JSON.parse(cutoff)).toThrow(SyntaxError);
    let check = push({
      type: "TOOL_CALL_ARGS",
      toolCallId: "call-1",
      delta: cutoff,
    });
    expect(check?.partial).toEqual({ title: "Pas" });
    expect(check?.results.card.valid).toBe(true);
  });
  it("streams three deltas and reports per-view readiness from final", () => {
    let recipe = z.object({ title: z.string(), servings: z.number() }).partial();
    let views = { card: { title: true }, kitchen: { title: true, servings: true } };
    let push = createAgUiPartialValidator(recipe, views);
    let partials = ['{"title":"Pa', 'sta","serv', 'ings":2}'].map(
      (delta) => push({ type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta })?.partial,
    );
    expect(partials).toEqual([{ title: "Pa" }, { title: "Pasta" }, { title: "Pasta", servings: 2 }]);
    let ready = createStreamValidator(recipe, views).final({ title: "Pasta" });
    expect([ready.card.valid, ready.kitchen.valid]).toEqual([true, false]);
  });

  it("reads bytes from a Node Readable incrementally", async () => {
    let encoder = new TextEncoder();
    let bytes = Readable.from([encoder.encode('{"title":"Pas'), encoder.encode('ta","servings":2}')]);
    let seen: unknown[] = [];
    for await (let partial of fromAsyncIterable(bytes)) seen.push(partial);
    expect(seen).toEqual([{ title: "Pas" }, { title: "Pasta", servings: 2 }]);
  });

  it("checks nested, array, and conditional configs", () => {
    let order = z
      .object({
        items: z.array(z.object({ name: z.string(), qty: z.number() }).partial()),
        delivery: z.object({ address: z.string(), notes: z.string() }).partial(),
      })
      .partial();
    let checkout = {
      items: { "*": { name: true, qty: true } },
      delivery: { address: true },
    } satisfies Config<z.infer<typeof order>>;
    let schema = transformSchema(order, checkout);
    expect(schema.safeParse({ items: [{ name: "Milk" }], delivery: { address: "Main St 1" } }).success).toBe(false);
    expect(schema.safeParse({ items: [{ name: "Milk", qty: 1 }], delivery: { address: "Main St 1" } }).success).toBe(true);
    let pickup = z.object({ pickup: z.boolean(), address: z.string().optional() });
    let rule = { address: { requiredIf: (data: { pickup: boolean }) => !data.pickup } };
    expect(makeConditionalSchemaTransformer({ pickup: false })(pickup, rule).schema.safeParse({ pickup: false }).success).toBe(false);
    expect(makeConditionalSchemaTransformer({ pickup: true })(pickup, rule).schema.safeParse({ pickup: true }).success).toBe(true);
  });

  it("validates transformed Zod schemas as Standard Schemas", async () => {
    let recipe = z.object({ title: z.string(), servings: z.number() }).partial();
    let report = await validateAgainstStandardSchemas({ title: "Pasta" }, {
      card: transformSchema(recipe, { title: true }),
      kitchen: transformSchema(recipe, { title: true, servings: true }),
    });
    expect([report.card.valid, report.kitchen.valid]).toEqual([true, false]);
  });

  it("reports views from the Effect validator", () => {
    let recipe = z.object({ title: z.string().optional(), servings: z.number().optional() });
    let validator = createEffectStreamValidator(recipe, { card: { title: true }, kitchen: { servings: true } });
    let report = Effect.runSync(validator.final('{"title":"Pasta"}'));
    expect([report.configs.card.valid, report.configs.kitchen.valid]).toEqual([true, false]);
  });
});
