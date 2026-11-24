import { runInNewContext } from "node:vm";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  err,
  isResult,
  isSettled,
  ok,
  parse,
  parseAsync,
  parseStream,
  type Issues,
  type Result,
  type StreamStep,
} from "../result";
import type { StandardSchemaV1 } from "../standard";

const recipe = z.object({
  title: z.string().min(1),
  servings: z.number().int().positive(),
});
const partialRecipe = z
  .object({ title: z.string(), servings: z.number() })
  .partial();

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
    if (!result.ok)
      expect(result.error.map((issue) => issue.path?.[0])).toEqual([
        "title",
        "servings",
      ]);
    const recovered = result.recover((issues) => -issues.length);
    expect(recovered).toMatchObject({ ok: true, value: -2 });
  });

  it("maps errors and matches both tracks", () => {
    const failed = err<string, number>("bad").mapError(
      (message) => message.length,
    );
    expect(
      failed.match(
        (value) => `ok ${value}`,
        (length) => `err ${length}`,
      ),
    ).toBe("err 3");
    expect(
      ok<number, string>(2)
        .mapError((message) => message.length)
        .match(String, () => "none"),
    ).toBe("2");
    expect(ok<number, string>(2).recover(() => 0)).toMatchObject({
      ok: true,
      value: 2,
    });
  });

  it("asks for parseAsync when a schema validates asynchronously", async () => {
    const asyncPositive: StandardSchemaV1<unknown, number> = {
      "~standard": {
        version: 1,
        vendor: "hand",
        validate: async (value) =>
          typeof value === "number" && value > 0
            ? { value }
            : { issues: [{ message: "must be positive" }] },
      },
    };
    const sync = parse(asyncPositive, 3);
    expect(!sync.ok && sync.error[0]?.message).toMatch(/parseAsync/);
    expect(await parseAsync(asyncPositive, 3)).toMatchObject({
      ok: true,
      value: 3,
    });
    expect(await parseAsync(asyncPositive, -1)).toMatchObject({ ok: false });
    const otherRealm: StandardSchemaV1<unknown, number> = {
      "~standard": {
        version: 1,
        vendor: "hand",
        validate: () =>
          runInNewContext("Promise.resolve({ value: 1 })") as Promise<{
            value: number;
          }>,
      },
    };
    const fromOtherRealm = parse(otherRealm, 1);
    expect(!fromOtherRealm.ok && fromOtherRealm.error[0]?.message).toMatch(
      /parseAsync/,
    );
  });
});

describe("isResult", () => {
  it("accepts ok and err and rejects look-alikes", () => {
    expect(isResult(ok(1))).toBe(true);
    expect(isResult(err("bad"))).toBe(true);
    expect(isResult(parse(recipe, {}))).toBe(true);
    expect(isResult(ok(1).map(String).recover(() => ""))).toBe(true);
    expect(isResult({ ok: true, value: 1 })).toBe(false);
    expect(isResult(JSON.parse(JSON.stringify(ok(1))))).toBe(false);
    expect(isResult(null)).toBe(false);
    expect(isResult(1)).toBe(false);
  });

  it("hides the brand from keys, JSON, and equality", () => {
    expect(
      Object.prototype.propertyIsEnumerable.call(
        ok(1),
        Symbol.for("adaptate.result"),
      ),
    ).toBe(false);
    expect(JSON.stringify(ok(1))).toBe('{"ok":true,"value":1}');
    expect(ok(1)).toMatchObject({ ok: true, value: 1 });
    expect(Object.getOwnPropertySymbols(ok(1))).toEqual([
      runInNewContext('Symbol.for("adaptate.result")'),
    ]);
  });
});

describe("parseStream", () => {
  it("reports where the stream is still open", async () => {
    const steps = await collect(
      parseStream(chunks('{"tags":["c1","c', '2"]}'), z.unknown()),
    );
    expect(
      steps.map(({ done, openPath, tailOpen }) => ({ done, openPath, tailOpen })),
    ).toEqual([
      { done: false, openPath: ["tags", 1], tailOpen: true },
      { done: false, openPath: [], tailOpen: false },
      { done: true, openPath: [], tailOpen: false },
    ]);
    const cut = await collect(parseStream(chunks('{"a":{"b":1'), z.unknown()));
    expect(cut.at(-1)).toMatchObject({
      done: true,
      result: { ok: false },
      openPath: ["a", "b"],
      tailOpen: true,
    });
    const empty = await collect(parseStream(chunks(), z.unknown()));
    expect(empty[0]).toMatchObject({ openPath: [], tailOpen: false });
    expect(Object.keys(steps[0] as object)).toEqual(["done", "result"]);
    expect(isSettled(steps[0] as StreamStep<unknown, unknown>, ["tags", 0])).toBe(true);
    expect(isSettled(steps[0] as StreamStep<unknown, unknown>, ["tags", 1])).toBe(false);
    expect(isSettled(steps[2] as StreamStep<unknown, unknown>, [])).toBe(true);
    expect(isSettled(steps[2] as StreamStep<unknown, unknown>, ["nope"])).toBe(false);
    expect(isSettled(cut.at(-1) as StreamStep<unknown, unknown>, ["a"])).toBe(false);
  });

  it("settles no path on a partial step whose partial schema fails", async () => {
    const steps = await collect(
      parseStream(
        chunks('{"a":1,"b":"x'),
        z.unknown(),
        z.object({ a: z.string() }),
      ),
    );
    const partial = steps[0] as StreamStep<unknown, unknown>;
    expect(partial.result.ok).toBe(false);
    expect(isSettled(partial, ["a"])).toBe(false);
    expect(isSettled(partial, [])).toBe(false);
  });

  it("checks each partial and the final value", async () => {
    const steps = await collect(
      parseStream(
        chunks('{"title":"Pas', 'ta","servings":', "4}"),
        recipe,
        partialRecipe,
      ),
    );
    expect(
      steps.slice(0, -1).every((step) => !step.done && step.result.ok),
    ).toBe(true);
    expect(steps.at(-1)).toMatchObject({
      done: true,
      result: { ok: true, value: { title: "Pasta", servings: 4 } },
    });
  });

  it("puts a bad final value on the error track", async () => {
    const steps = await collect(
      parseStream(chunks('{"title":"","servings":0}'), recipe),
    );
    const last = steps.at(-1);
    expect(last?.done).toBe(true);
    expect(last?.result.ok).toBe(false);
  });

  it("flags a partial that breaks the partial schema", async () => {
    const steps = await collect(
      parseStream(chunks('{"servings":"four"}'), recipe, partialRecipe),
    );
    expect(steps.some((step) => !step.done && !step.result.ok)).toBe(true);
  });

  it("errs when the stream stops before the value closes", async () => {
    const steps = await collect(
      parseStream(chunks('{"title":"Pasta","servings":3'), recipe),
    );
    expect(steps.at(-1)).toMatchObject({ done: true, result: { ok: false } });
    const last = steps.at(-1);
    expect(last && !last.result.ok && last.result.error[0]?.message).toMatch(
      /without one complete JSON value/,
    );
  });

  it("accepts a top-level number and rejects text after the value", async () => {
    const number = z.number();
    for (const parts of [["42"], ["4", "2"], ["42 "], ["-1.5e3"]]) {
      const steps = await collect(parseStream(chunks(...parts), number));
      expect(steps.at(-1)?.result, parts.join("|")).toMatchObject({ ok: true });
    }
    for (const text of [
      "1.",
      "1e",
      "-1e-",
      "-",
      "1 2",
      "[1] 2",
      '"a" 1',
      "true 1",
      "[1,]",
      '{"a":1,}',
      '{"a":{"b":1,},"c":2}',
    ]) {
      const steps = await collect(parseStream(chunks(text), z.unknown()));
      expect(steps.at(-1)?.result, text).toMatchObject({ ok: false });
    }
    for (const text of [
      '{"title":"Pasta","servings":3} x',
      '{"title":"Pasta","servings":3} 2',
      '{"title":"Pasta","servings":3}{"title":"Rice","servings":1}',
    ]) {
      const steps = await collect(parseStream(chunks(text), recipe));
      expect(steps.at(-1), text).toMatchObject({
        done: true,
        result: { ok: false },
      });
    }
    const spaced = await collect(
      parseStream(chunks('{"title":"Pasta","servings":3} ', "\n"), recipe),
    );
    expect(spaced.at(-1)).toMatchObject({ done: true, result: { ok: true } });
  });

  it("decodes bytes split inside a character", async () => {
    const bytes = new TextEncoder().encode('{"title":"Påsta","servings":4}');
    const split = bytes.indexOf(0xc3) + 1;
    async function* byteChunks() {
      yield bytes.slice(0, split);
      yield bytes.slice(split);
    }
    const steps = await collect(parseStream(byteChunks(), recipe));
    expect(steps.at(-1)).toMatchObject({
      done: true,
      result: { ok: true, value: { title: "Påsta", servings: 4 } },
    });
  });

  it("errs when the stream carries no value", async () => {
    const steps = await collect(parseStream(chunks(), recipe));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ done: true, result: { ok: false } });
  });
});
