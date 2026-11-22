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
import { type AgUiDeltaEvent } from "../stream";

const recipe = z.object({
  title: z.string().optional(),
  servings: z.number().optional(),
});
const configs = {
  card: { title: true },
  kitchen: { servings: true },
};
const streamValidator = createEffectStreamValidator(recipe, configs);

function settle<A, E>(effect: Effect.Effect<A, E>) {
  return Effect.runSync(
    Effect.match(effect, {
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  );
}

describe("validate", () => {
  it("returns a recipe that includes the required title", () => {
    const outcome = settle(
      validate(recipe, { title: true }, { title: "Pasta", servings: 2 }),
    );
    expect(outcome).toEqual({
      ok: true,
      value: { title: "Pasta", servings: 2 },
    });
  });

  it("fails when the required title is missing", () => {
    const outcome = settle(validate(recipe, { title: true }, { servings: 2 }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatchObject({
      _tag: "AdaptateValidationError",
      configName: "config",
    });
    expect(outcome.error.issues).toEqual([
      expect.objectContaining({ code: "invalid_type", path: ["title"] }),
    ]);
  });

  it("keeps the thrown message when the schema is not an object", () => {
    const outcome = settle(validate(z.string(), true, "hi"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.configName).toBe("config");
    expect(outcome.error.issues).toEqual([
      expect.objectContaining({
        code: "custom",
        message: "The given schema must be a Zod object.",
      }),
    ]);
  });
});

describe("validatePartial", () => {
  it("accepts a title when servings is still absent", () => {
    const partial = { title: "Pasta" };
    expect(settle(validatePartial(recipe, configs, partial))).toEqual({
      ok: true,
      value: partial,
    });
  });

  it("rejects a partial when servings is not a number", () => {
    const outcome = settle(
      validatePartial(recipe, configs, {
        servings: "x" as unknown as number,
      }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.configName).toBe("card");
    expect(outcome.error.issues).toEqual([
      expect.objectContaining({
        code: "invalid_type",
        expected: "number",
        path: ["servings"],
      }),
    ]);
  });

  it("keeps zod issues when partial validation throws a ZodError", () => {
    const exploding = z.object({
      title: z.string().check(() => {
        throw new z.ZodError([
          {
            code: "custom",
            path: ["title"],
            message: "exploded",
          },
        ]);
      }),
    });
    const outcome = settle(
      validatePartial(exploding, { card: { title: true } }, { title: "Pasta" }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatchObject({
      _tag: "AdaptateValidationError",
      configName: "partial",
      issues: [{ code: "custom", path: ["title"], message: "exploded" }],
    });
  });

  it("keeps a thrown non-error as the partial failure message", () => {
    const exploding = z.object({
      title: z.string().check(() => {
        throw "not-an-error";
      }),
    });
    const outcome = settle(
      validatePartial(exploding, { card: { title: true } }, { title: "Pasta" }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.issues).toEqual([
      expect.objectContaining({ code: "custom", message: "not-an-error" }),
    ]);
  });

  it("keeps the thrown message when the partial schema is not an object", () => {
    const outcome = settle(validatePartial(z.string(), { card: true }, "hi"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.configName).toBe("partial");
    expect(outcome.error.issues).toEqual([
      expect.objectContaining({
        code: "custom",
        message: "The given schema must be a Zod object or array.",
      }),
    ]);
  });
});

describe("createEffectStreamValidator", () => {
  it("final returns the recipe when card and kitchen both accept it", () => {
    expect(
      settle(streamValidator.final('{"title":"Pasta","servings":2}')),
    ).toEqual({
      ok: true,
      value: {
        value: { title: "Pasta", servings: 2 },
        configs: {
          card: { valid: true, issues: null },
          kitchen: { valid: true, issues: null },
        },
      },
    });
  });

  it("final reports card valid and kitchen invalid for a title-only document", () => {
    const outcome = settle(streamValidator.final('{"title":"Pasta"}'));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.value).toEqual({ title: "Pasta" });
    expect(outcome.value.configs.card).toEqual({ valid: true, issues: null });
    expect(outcome.value.configs.kitchen.valid).toBe(false);
    expect(outcome.value.configs.kitchen.issues).toEqual([
      expect.objectContaining({ path: ["servings"] }),
    ]);
  });

  it("final with kitchen fails when servings missing", () => {
    const outcome = settle(streamValidator.final('{"title":"Pasta"}', "kitchen"));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(AdaptateValidationError);
    if (!(outcome.error instanceof AdaptateValidationError)) return;
    expect(outcome.error.configName).toBe("kitchen");
    expect(outcome.error.issues).toEqual([
      expect.objectContaining({ path: ["servings"] }),
    ]);
  });

  it("final with an unknown config name fails", () => {
    const outcome = settle(
      streamValidator.final('{"title":"Pasta"}', "pantry" as "card"),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(AdaptateValidationError);
    if (!(outcome.error instanceof AdaptateValidationError)) return;
    expect(outcome.error.configName).toBe("pantry");
    expect(outcome.error.issues).toEqual([
      {
        code: "custom",
        message: "unknown config",
        path: [],
      },
    ]);
  });

  it("final with card accepts a title-only document", () => {
    expect(settle(streamValidator.final('{"title":"Pasta"}', "card"))).toEqual({
      ok: true,
      value: { title: "Pasta" },
    });
  });

  it("final fails the base schema when servings is not a number", () => {
    const outcome = settle(
      streamValidator.final('{"title":"Pasta","servings":"x"}'),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(AdaptateValidationError);
    if (!(outcome.error instanceof AdaptateValidationError)) return;
    expect(outcome.error.configName).toBe("schema");
    expect(outcome.error.issues).toEqual([
      expect.objectContaining({
        code: "invalid_type",
        expected: "number",
        path: ["servings"],
      }),
    ]);
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
      value: {
        value: { title: "Pasta", servings: 2 },
        configs: {
          card: { valid: true, issues: null },
          kitchen: { valid: true, issues: null },
        },
      },
    });
  });

  it("final validates only the base schema when no configs are named", () => {
    const bare = createEffectStreamValidator(recipe, {});
    expect(settle(bare.final('{"title":"Pasta"}'))).toEqual({
      ok: true,
      value: { value: { title: "Pasta" }, configs: {} },
    });
    const invalid = settle(bare.final("null"));
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error).toMatchObject({
      _tag: "AdaptateValidationError",
      configName: "schema",
    });
  });

  it("final fails when named configs cannot transform the schema", () => {
    const textOnly = createEffectStreamValidator(z.string(), { card: true });
    const outcome = settle(textOnly.final('"hi"'));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(AdaptateValidationError);
    if (!(outcome.error instanceof AdaptateValidationError)) return;
    expect(outcome.error.configName).toBe("schema");
    expect(outcome.error.issues).toEqual([
      expect.objectContaining({
        code: "custom",
        message: "The given schema must be a Zod object.",
      }),
    ]);
  });

  it("partial reports a type error for servings on every consumer", () => {
    const report = Effect.runSync(
      streamValidator.partial({
        title: "Pasta",
        servings: "x" as unknown as number,
      }),
    );
    expect(report.card.valid).toBe(false);
    expect(report.card.errors?.issues).toEqual([
      expect.objectContaining({
        code: "invalid_type",
        expected: "number",
        path: ["servings"],
      }),
    ]);
    expect(report.kitchen.valid).toBe(false);
    expect(report.kitchen.errors?.issues[0]?.path).toEqual(["servings"]);
  });

  it("uses a caller feed for AG-UI when one is passed", () => {
    const fed = createEffectStreamValidator(recipe, configs, () => () => ({ title: "fed" }));
    const outcome = Effect.runSync(
      fed.agUi({ type: "TOOL_CALL_ARGS", toolCallId: "t1", delta: "x" }),
    );
    expect(outcome?.partial).toEqual({ title: "fed" });
    expect(
      Effect.runSync(
        fed.agUi({
          type: "REASONING_MESSAGE_CONTENT",
          messageId: "m",
          delta: '{"title":"Nope"}',
        }),
      ),
    ).toBeUndefined();
    expect(
      Effect.runSync(
        fed.agUi({
          type: "THINKING_TEXT_MESSAGE_CONTENT",
          messageId: "m",
          delta: '{"title":"Nope"}',
        }),
      ),
    ).toBeUndefined();
    expect(Effect.runSync(fed.agUi({} as unknown as AgUiDeltaEvent))).toBeUndefined();
    expect(
      Effect.runSync(
        fed.agUi({ delta: '{"title":"Nope"}' } as unknown as AgUiDeltaEvent),
      ),
    ).toBeUndefined();
    const streamed = Effect.runSync(
      Stream.runCollect(
        fed.agUiStream(
          Stream.make({ type: "TOOL_CALL_ARGS", toolCallId: "t2", delta: "y" }),
        ),
      ),
    );
    expect(streamed[0]?.partial).toEqual({ title: "fed" });
  });

  it("accumulates AG-UI deltas per call", () => {
    const fresh = createEffectStreamValidator(recipe, configs);
    expect(Effect.runSync(fresh.agUi({ type: "RUN_STARTED" }))).toBeUndefined();
    expect(
      Effect.runSync(
        fresh.agUi({
          type: "REASONING_MESSAGE_CONTENT",
          messageId: "m",
          delta: '{"title":"Nope"}',
        }),
      ),
    ).toBeUndefined();
    expect(
      Effect.runSync(
        fresh.agUi({
          type: "THINKING_TEXT_MESSAGE_CONTENT",
          messageId: "m",
          delta: '{"title":"Nope"}',
        }),
      ),
    ).toBeUndefined();
    expect(Effect.runSync(fresh.agUi({} as unknown as AgUiDeltaEvent))).toBeUndefined();
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
              if (specifier.startsWith("./") || specifier.startsWith("../")) {
                if (specifier.endsWith(".js")) {
                  try {
                    return nextResolve(specifier.slice(0, -3) + ".ts", context);
                  } catch {
                    return nextResolve(specifier, context);
                  }
                }
                if (!/\\.(?:[cm]?js|[cm]?ts|json)$/.test(specifier)) {
                  return nextResolve(specifier + ".ts", context);
                }
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
