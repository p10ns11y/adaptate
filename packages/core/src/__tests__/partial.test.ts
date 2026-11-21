import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";

import { transformSchema, type Config, type DeepPartial } from "../";
import {
  transformPartialSchema,
  validatePartialAgainstConfigs,
  makeStreamingConditionalTransformer,
  schemasForConfigs,
} from "../partial.js";

const person = z.object({
  name: z.string(),
  email: z.email(),
  age: z.number().optional(),
  address: z
    .object({ city: z.string(), country: z.string().optional() })
    .optional(),
  tags: z.array(z.object({ label: z.string(), weight: z.number() })),
});
type Person = z.infer<typeof person>;

describe("transformPartialSchema", () => {
  const config = {
    name: true,
    age: true,
    address: { city: true },
    tags: { "*": { label: true } },
  } satisfies Config<DeepPartial<Person>>;

  it("accepts a partial missing required and configured fields", () => {
    const partial: DeepPartial<Person> = { name: "Ada" };
    expect(
      transformPartialSchema(person, config)(partial).safeParse(partial)
        .success,
    ).toBe(true);
  });

  it("validates fields that are present", () => {
    const partial = { name: "Ada", email: "not-an-email" };
    const result = transformPartialSchema(
      person,
      config,
    )(partial).safeParse(partial);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["email"]);
  });

  it("recurses into present nested objects", () => {
    const ok = { address: { country: "SE" } };
    expect(
      transformPartialSchema(person, config)(ok).safeParse(ok).success,
    ).toBe(true);
    const bad = { address: { city: 42 } } as unknown as DeepPartial<Person>;
    const result = transformPartialSchema(person, config)(bad).safeParse(bad);
    expect(result.error?.issues[0]?.path).toEqual(["address", "city"]);
  });

  it("validates each streamed array element against its own present fields", () => {
    const partial = { tags: [{ label: "a", weight: 1 }, { label: "b" }] };
    expect(
      transformPartialSchema(person, config)(partial).safeParse(partial)
        .success,
    ).toBe(true);
    const bad = {
      tags: [{ label: "a", weight: "x" }],
    } as unknown as DeepPartial<Person>;
    const result = transformPartialSchema(person, config)(bad).safeParse(bad);
    expect(result.error?.issues[0]?.path).toEqual(["tags", 0, "weight"]);
  });

  it("keeps present fields optional-typed when config is false", () => {
    const schema = transformPartialSchema(person, { email: false })({
      email: "a@b.se",
    });
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("supports a top-level array schema", () => {
    const list = z.array(z.object({ id: z.number(), title: z.string() }));
    const partial = [{ id: 1, title: "x" }, { id: 2 }];
    expect(
      transformPartialSchema(list, { "*": { title: true } })(partial).safeParse(
        partial,
      ).success,
    ).toBe(true);
  });

  it("treats a boolean config on a present container as no nested config", () => {
    const partial = { address: { country: "SE" }, tags: [{ label: "a" }] };
    expect(
      transformPartialSchema(person, { address: true, tags: true })(
        partial,
      ).safeParse(partial).success,
    ).toBe(true);
  });

  it("rejects non object or array schemas", () => {
    expect(() => transformPartialSchema(z.string(), true)).toThrow(
      "must be a Zod object or array",
    );
  });

  it("infers the partial type", () => {
    const forPartial = transformPartialSchema(person, config);
    expectTypeOf(forPartial).parameter(0).toEqualTypeOf<DeepPartial<Person>>();
  });
});

describe("schemasForConfigs", () => {
  it("builds one schema per config at the call and skips a config that cannot transform", () => {
    const baseSchema = z.object({ name: z.string().optional() });
    const built = schemasForConfigs(
      baseSchema,
      { card: { name: true }, text: true },
      transformSchema,
    );
    expect(built.card?.safeParse({}).success).toBe(false);
    expect(built.card?.safeParse({ name: "Ada" }).success).toBe(true);
    const textOnly = schemasForConfigs(
      z.string(),
      { card: true },
      transformSchema,
    );
    expect(textOnly.card).toBeUndefined();
  });
});

describe("validatePartialAgainstConfigs", () => {
  it("returns one result per consumer config", () => {
    const results = validatePartialAgainstConfigs(
      person,
      { name: "Ada", email: "bad" },
      { form: { name: true }, preview: { age: false } },
    );
    expect(results.form.valid).toBe(false);
    expect(results.form.errors?.issues[0]?.path).toEqual(["email"]);
    expect(results.preview.valid).toBe(false);
    expect(results.preview.errors?.issues[0]?.path).toEqual(["email"]);
    const clean = validatePartialAgainstConfigs(
      person,
      { name: "Ada" },
      { form: { name: true } },
    );
    expect(clean.form).toEqual({ valid: true, errors: null });
  });
});

describe("makeStreamingConditionalTransformer", () => {
  const order = z.object({
    kind: z.enum(["pickup", "delivery"]).optional(),
    address: z.string().optional(),
    note: z.string().optional(),
  });

  it("applies requiredIf on present data and never throws on incomplete data", () => {
    const partial: { kind?: "pickup" | "delivery"; address?: string } = {
      kind: "delivery",
    };
    const transformer = makeStreamingConditionalTransformer(partial)(order, {
      address: {
        requiredIf: (data: typeof partial) => data.kind === "delivery",
      },
      note: (data: typeof partial) => data.kind === "pickup",
      kind: true,
    });
    expect(transformer.staticConfig).toEqual({
      address: true,
      note: false,
      kind: true,
    });
    expect(transformer.run().success).toBe(true);
    const filled = {
      kind: "delivery" as const,
      address: 7,
    } as unknown as typeof partial;
    expect(
      makeStreamingConditionalTransformer(filled)(order, {
        address: true,
      }).run().success,
    ).toBe(false);
  });
});
