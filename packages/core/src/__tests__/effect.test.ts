import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AdaptateParseError,
  AdaptateValidationError,
  createEffectStreamValidator,
  validate,
  validatePartial,
} from "../effect";

const recipe = z.object({
  title: z.string().optional(),
  servings: z.number().optional(),
});
const configs = {
  card: { title: true },
  kitchen: { servings: true },
};

function settle<A, E>(effect: Effect.Effect<A, E>) {
  return Effect.runSync(
    Effect.match(effect, {
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  );
}

describe("validate", () => {
  it("returns the parsed value", () => {
    const outcome = settle(
      validate(recipe, { title: true }, { title: "Pasta", servings: 2 }),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toEqual({ title: "Pasta", servings: 2 });
  });

  it("fails with the config name and zod issues", () => {
    const outcome = settle(validate(recipe, { title: true }, { servings: 2 }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(AdaptateValidationError);
    expect(outcome.error._tag).toBe("AdaptateValidationError");
    expect(outcome.error.configName).toBe("config");
    expect(outcome.error.issues.map((issue) => issue.path)).toEqual([
      ["title"],
    ]);
  });

  it("fails when the schema is not an object", () => {
    const outcome = settle(validate(z.string(), true, "hi"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.issues).toEqual([]);
    expect(outcome.error.configName).toBe("config");
  });
});

describe("validatePartial", () => {
  it("returns the partial when every named config accepts it", () => {
    const partial = { title: "Pasta" };
    const outcome = settle(validatePartial(recipe, configs, partial));
    expect(outcome).toEqual({ ok: true, value: partial });
  });

  it("fails with the first config whose present fields are invalid", () => {
    const outcome = settle(
      validatePartial(recipe, configs, { servings: "x" as unknown as number }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.configName).toBe("card");
    expect(outcome.error.issues.map((issue) => issue.path)).toEqual([
      ["servings"],
    ]);
  });

  it("fails when the schema is not an object or array", () => {
    const outcome = settle(validatePartial(z.string(), { card: true }, "hi"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatchObject({
      _tag: "AdaptateValidationError",
      configName: "partial",
      issues: [],
    });
  });
});

describe("createEffectStreamValidator", () => {
  const streamValidator = createEffectStreamValidator(recipe, configs);

  it("reports partials without failing", () => {
    const report = Effect.runSync(
      streamValidator.partial({ title: "Pasta", servings: "x" as unknown as number }),
    );
    expect(report.card.valid).toBe(false);
    expect(report.kitchen.valid).toBe(false);
  });

  it("parses a final document into the schema output", () => {
    const outcome = settle(
      streamValidator.final('{"title":"Pasta","servings":2}'),
    );
    expect(outcome).toEqual({
      ok: true,
      value: { title: "Pasta", servings: 2 },
    });
  });

  it("fails the next config when an earlier one accepts the final text", () => {
    const outcome = settle(streamValidator.final('{"title":"Pasta"}'));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(AdaptateValidationError);
    if (!(outcome.error instanceof AdaptateValidationError)) return;
    expect(outcome.error.configName).toBe("kitchen");
    expect(outcome.error.issues.map((issue) => issue.path)).toEqual([
      ["servings"],
    ]);
  });

  it("fails the first config when the final document misses its fields", () => {
    const outcome = settle(streamValidator.final("{}"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(AdaptateValidationError);
    if (!(outcome.error instanceof AdaptateValidationError)) return;
    expect(outcome.error.configName).toBe("card");
  });

  it("fails with a parse error when the text cannot be parsed", () => {
    const outcome = settle(streamValidator.final("}"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(AdaptateParseError);
    expect(outcome.error).toMatchObject({
      _tag: "AdaptateParseError",
      text: "}",
    });
  });

  it("rejects a truncated final and accepts the completed document", () => {
    const truncatedText = '{"title":"Pasta","servings":2';
    const truncated = settle(streamValidator.final(truncatedText));
    expect(truncated.ok).toBe(false);
    if (truncated.ok) return;
    expect(truncated.error).toBeInstanceOf(AdaptateParseError);
    expect(truncated.error).toMatchObject({
      _tag: "AdaptateParseError",
      text: truncatedText,
    });
    expect(
      settle(streamValidator.final('{"title":"Pasta","servings":2}')),
    ).toEqual({
      ok: true,
      value: { title: "Pasta", servings: 2 },
    });
  });

  it("validates a final document against the schema when no configs are named", () => {
    const bare = createEffectStreamValidator(recipe, {});
    expect(settle(bare.final('{"title":"Pasta"}'))).toEqual({
      ok: true,
      value: { title: "Pasta" },
    });
    const invalid = settle(bare.final("null"));
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error).toMatchObject({
      _tag: "AdaptateValidationError",
      configName: "schema",
    });
  });

  it("accepts a final document for a single config", () => {
    const cardOnly = createEffectStreamValidator(recipe, {
      card: { title: true },
    });
    expect(settle(cardOnly.final('{"title":"Only"}'))).toEqual({
      ok: true,
      value: { title: "Only" },
    });
  });

  it("accumulates AG-UI deltas", () => {
    const fresh = createEffectStreamValidator(recipe, configs);
    expect(Effect.runSync(fresh.agUi({ type: "RUN_STARTED" }))).toBeUndefined();
    const parsed = Effect.runSync(
      fresh.agUi({
        type: "TOOL_CALL_ARGS",
        toolCallId: "t1",
        delta: '{"title":"Pasta","servings":2}',
      }),
    );
    expect(parsed).toMatchObject({
      id: "t1",
      partial: { title: "Pasta", servings: 2 },
    });
    expect(parsed?.results.card.valid).toBe(true);
    expect(parsed?.results.kitchen.valid).toBe(true);
  });

  it("streams AG-UI deltas in order", () => {
    const collected = Effect.runSync(
      Stream.runCollect(
        streamValidator.agUiStream(
          Stream.make(
            { type: "RUN_STARTED" },
            {
              type: "TOOL_CALL_ARGS",
              toolCallId: "t1",
              delta: '{"title":"Pa',
            },
            {
              type: "TEXT_MESSAGE_CONTENT",
              messageId: "m1",
              delta: '{"servings":2}',
            },
          ),
        ),
      ),
    );
    expect(collected[0]).toBeUndefined();
    expect(collected[1]).toMatchObject({
      id: "t1",
      partial: { title: "Pa" },
    });
    expect(collected[2]).toMatchObject({
      id: "m1",
      partial: { servings: 2 },
    });
  });
});

describe("core without effect", () => {
  it("loads the main entry and stream when effect cannot be resolved", () => {
    const coreRoot = fileURLToPath(new URL("../..", import.meta.url));
    const indexUrl = pathToFileURL(join(coreRoot, "src/index.ts")).href;
    const streamUrl = pathToFileURL(join(coreRoot, "src/stream.ts")).href;
    const childEnv = { ...process.env };
    delete childEnv.NODE_OPTIONS;
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "--eval",
        `
          import { registerHooks } from "node:module";
          registerHooks({
            resolve(specifier, context, nextResolve) {
              if (specifier === "effect" || specifier.startsWith("effect/")) {
                const missing = new Error("effect is not installed");
                missing.code = "ERR_MODULE_NOT_FOUND";
                throw missing;
              }
              if (
                (specifier.startsWith("./") || specifier.startsWith("../")) &&
                !/\\.(?:[cm]?js|[cm]?ts|json)$/.test(specifier)
              ) {
                return nextResolve(specifier + ".ts", context);
              }
              return nextResolve(specifier, context);
            },
          });
          const core = await import(${JSON.stringify(indexUrl)});
          const stream = await import(${JSON.stringify(streamUrl)});
          if (typeof core.transformSchema !== "function") {
            throw new Error("main entry did not load");
          }
          if (typeof stream.createStreamValidator !== "function") {
            throw new Error("stream entry did not load");
          }
          console.log("loaded-without-effect");
        `,
      ],
      { cwd: coreRoot, encoding: "utf8", env: childEnv },
    );
    expect(result.stderr ?? "").not.toMatch(/effect is not installed/);
    expect(result.stdout).toContain("loaded-without-effect");
    expect(result.status).toBe(0);
  });
});
