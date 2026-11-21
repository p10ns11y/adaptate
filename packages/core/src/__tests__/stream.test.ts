import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
  parsePartialJson,
  createStreamValidator,
  validateStructuredOutput,
  createAgUiPartialValidator,
} from "../stream";

const recipe = z.object({
  title: z.string(),
  servings: z.number(),
  steps: z.array(z.object({ text: z.string(), minutes: z.number() })),
});
const configs = {
  card: { title: true },
  timer: { steps: { "*": { minutes: true } } },
};

describe("parsePartialJson", () => {
  it.each([
    ['{"title":"Pa', { title: "Pa" }],
    ['{"title":"Pasta","serv', { title: "Pasta" }],
    ['{"steps":[{"text":"boil"},', { steps: [{ text: "boil" }] }],
    ['{"servings":4,', { servings: 4 }],
    ['{"title":"a\\', { title: "a" }],
    ['{"title":"a\\"b"}', { title: 'a"b' }],
    ['{"ok":tr', {}],
    ["[1,2", [1, 2]],
  ])("parses %s", (text, expected) => {
    expect(parsePartialJson(text)).toEqual(expected);
  });

  it("returns undefined when nothing parses", () => {
    expect(parsePartialJson("")).toBeUndefined();
    expect(parsePartialJson("}")).toBeUndefined();
  });
});

describe("createStreamValidator", () => {
  it("accepts a later partial whose present keys differ from the first", () => {
    const validator = createStreamValidator(recipe, configs);
    expect(validator.partial({ title: "Pasta" }).card.valid).toBe(true);
    expect(validator.partial({ steps: [{ text: "boil" }] }).timer.valid).toBe(
      true,
    );
    expect(
      validator.partial({
        steps: [{ text: "boil", minutes: "x" as unknown as number }],
      }).timer.valid,
    ).toBe(false);
  });

  it("final keeps the schemas built when the validator was created", () => {
    const config = { title: false as boolean };
    const validator = createStreamValidator(recipe, { card: config });
    const payload = {
      servings: 2,
      steps: [{ text: "boil", minutes: 1 }],
    };
    expect(validator.final(payload).card.valid).toBe(true);
    config.title = true;
    expect(validator.final(payload).card.valid).toBe(true);
  });

  it("checks an array with one cached schema and defers a transform failure to final", () => {
    const list = z.array(z.object({ id: z.number(), title: z.string() }));
    const cached = createStreamValidator(list, {
      card: { "*": { title: true } },
    });
    expect(cached.partial([{ title: "x" }]).card.valid).toBe(true);
    expect(
      cached.partial([{ title: 1 as unknown as string }]).card.valid,
    ).toBe(false);
    const deferred = createStreamValidator(list, { card: true });
    expect(deferred.partial([]).card.valid).toBe(true);
    expect(() => deferred.final([])).toThrow(
      "The given schema must be a Zod object.",
    );
  });

  it("reports a non-object schema from final", () => {
    const validator = createStreamValidator(z.string(), { card: true });
    expect(() => validator.final("hi")).toThrow(
      "The given schema must be a Zod object.",
    );
  });

  it("validates partials leniently and finals strictly per consumer", () => {
    const validator = createStreamValidator(recipe, configs);
    expect(validator.partial({ title: "Pasta" }).card.valid).toBe(true);
    const final = validator.final({
      title: "Pasta",
      servings: 2,
      steps: [{ text: "boil" }],
    });
    expect(final.card).toEqual({ valid: false, errors: expect.anything() });
    expect(
      validator.final({
        title: "Pasta",
        servings: 2,
        steps: [{ text: "boil", minutes: 9 }],
      }).timer,
    ).toEqual({ valid: true, errors: null });
  });
});

describe("validateStructuredOutput", () => {
  it("maps a TanStack useChat partial and final", () => {
    expect(
      validateStructuredOutput({ partial: null, final: null }, recipe, configs),
    ).toEqual({
      partial: null,
      final: null,
    });
    const midStream = validateStructuredOutput(
      { partial: { servings: "x" as unknown as number } },
      recipe,
      configs,
    );
    expect(midStream.partial?.card.valid).toBe(false);
    expect(midStream.final).toBeNull();
    const done = validateStructuredOutput(
      { final: { title: "P", servings: 1, steps: [] } },
      recipe,
      configs,
    );
    expect(done.final?.card.valid).toBe(true);
    expect(done.partial).toBeNull();
  });
});

describe("createAgUiPartialValidator", () => {
  it("matches parsePartialJson for one-character deltas", () => {
    const samples = [
      '{"title":"Pa',
      '{"title":"Pasta","serv',
      '{"steps":[{"text":"boil"},',
      '{"servings":4,',
      '{"title":"a\\',
      '{"title":"a\\"b"}',
      '{"ok":tr',
      "[1,2",
      "[1]",
      "}",
      "",
    ];
    for (const text of samples) {
      const push = createAgUiPartialValidator(recipe, configs);
      let buffer = "";
      for (const character of text) {
        buffer += character;
        const outcome = push({
          type: "TOOL_CALL_ARGS",
          toolCallId: "t",
          delta: character,
        });
        const expected = parsePartialJson(buffer);
        if (expected === undefined) {
          expect(outcome).toBeUndefined();
        } else {
          expect(outcome?.partial).toEqual(expected);
        }
      }
    }
  });

  it("accumulates tool call args and text deltas per id", () => {
    const push = createAgUiPartialValidator(recipe, configs);
    expect(push({ type: "RUN_STARTED" })).toBeUndefined();
    expect(push({ type: "TOOL_CALL_ARGS", toolCallId: "t1" })).toBeUndefined();
    expect(
      push({ type: "TOOL_CALL_ARGS", toolCallId: "t1", delta: "" }),
    ).toBeUndefined();
    const first = push({
      type: "TOOL_CALL_ARGS",
      toolCallId: "t1",
      delta: '{"title":"Pa',
    });
    expect(first?.partial).toEqual({ title: "Pa" });
    expect(first?.results.card.valid).toBe(true);
    const second = push({
      type: "TOOL_CALL_ARGS",
      toolCallId: "t1",
      delta: 'sta","servings":"x"',
    });
    expect(second?.results.card.valid).toBe(false);
    const text = push({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "m1",
      delta: '{"steps":[{"minutes":3',
    });
    expect(text).toMatchObject({
      id: "m1",
      partial: { steps: [{ minutes: 3 }] },
    });
    expect(text?.results.timer.valid).toBe(true);
  });
});
