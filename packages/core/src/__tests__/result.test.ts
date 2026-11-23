import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { err, ok, parse, parseAsync, parseStream, type Issues, type Result } from "../result";
import type { StandardSchemaV1 } from "../standard";

const recipe = z.object({ title: z.string().min(1), servings: z.number().int().positive() });
const partialRecipe = z.object({ title: z.string(), servings: z.number() }).partial();

async function* chunks(...parts: string[]) {
  for (const part of parts) yield part;
}

async function collect<T>(steps: AsyncIterable<T>): Promise<T[]> {
  const seen: T[] = [];
  for await (const step of steps) seen.push(step);
  return seen;
}

describe("Result", () => {
  it("keeps the ok track through map and flatMap", () => {
    const servings = parse(recipe, { title: "Pasta", servings: 4 })
      .map((value) => value.servings)
      .flatMap((count) => (count > 2 ? ok(count * 2) : err("too few")));
    expect(servings.ok && servings.value).toBe(8);
    expectTypeOf(servings).toEqualTypeOf<Result<number, Issues | string>>();
  });

  it("skips map and flatMap on the error track and recovers", () => {
    let calls = 0;
    const result = parse(recipe, { title: "", servings: 0 })
      .map(() => (calls += 1))
      .flatMap(() => ok((calls += 1)));
    expect(calls).toBe(0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.map((issue) => issue.path?.[0])).toEqual(["title", "servings"]);
    const recovered = result.recover((issues) => -issues.length);
    expect(recovered).toMatchObject({ ok: true, value: -2 });
  });

  it("maps errors and matches both tracks", () => {
    const failed = err<string, number>("bad").mapError((message) => message.length);
    expect(failed.match((value) => `ok ${value}`, (length) => `err ${length}`)).toBe("err 3");
    expect(ok<number, string>(2).mapError((message) => message.length).match(String, () => "none")).toBe("2");
    expect(ok<number, string>(2).recover(() => 0)).toMatchObject({ ok: true, value: 2 });
  });

  it("asks for parseAsync when a schema validates asynchronously", async () => {
    const asyncPositive: StandardSchemaV1<unknown, number> = {
      "~standard": {
        version: 1,
        vendor: "hand",
        validate: async (value) =>
          typeof value === "number" && value > 0 ? { value } : { issues: [{ message: "must be positive" }] },
      },
    };
    const sync = parse(asyncPositive, 3);
    expect(!sync.ok && sync.error[0]?.message).toMatch(/parseAsync/);
    expect(await parseAsync(asyncPositive, 3)).toMatchObject({ ok: true, value: 3 });
    expect(await parseAsync(asyncPositive, -1)).toMatchObject({ ok: false });
  });
});

describe("parseStream", () => {
  it("checks each partial and the final value", async () => {
    const steps = await collect(parseStream(chunks('{"title":"Pas', 'ta","servings":', "4}"), recipe, partialRecipe));
    expect(steps.slice(0, -1).every((step) => !step.done && step.result.ok)).toBe(true);
    expect(steps.at(-1)).toMatchObject({ done: true, result: { ok: true, value: { title: "Pasta", servings: 4 } } });
  });

  it("puts a bad final value on the error track", async () => {
    const steps = await collect(parseStream(chunks('{"title":"","servings":0}'), recipe));
    const last = steps.at(-1);
    expect(last?.done).toBe(true);
    expect(last?.result.ok).toBe(false);
  });

  it("flags a partial that breaks the partial schema", async () => {
    const steps = await collect(parseStream(chunks('{"servings":"four"}'), recipe, partialRecipe));
    expect(steps.some((step) => !step.done && !step.result.ok)).toBe(true);
  });

  it("errs when the stream carries no value", async () => {
    const steps = await collect(parseStream(chunks(), recipe));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ done: true, result: { ok: false } });
  });
});
