import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { partialPathIsValid } from "../partial";
import {
  createAgUiPartialValidator,
  createFrameThrottle,
  createPartialJsonParser,
  createStreamValidator,
  parsePartialJson,
  validateStructuredOutput,
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

describe("createStreamValidator construction", () => {
  it("does not parse the source schema again while checking a partial", () => {
    const schema = z.object({
      title: z.string(),
      steps: z.array(z.object({ minutes: z.number() })),
    });
    let sourceParses = 0;
    const parseSource = schema.safeParse.bind(schema);
    schema.safeParse = (value) => {
      sourceParses += 1;
      return parseSource(value);
    };
    const validator = createStreamValidator(schema, { card: { title: true } });
    const parsesAfterCreate = sourceParses;
    expect(validator.partial({}).card.valid).toBe(true);
    expect(
      validator.partial({ title: 1 } as unknown as { title: string }).card
        .valid,
    ).toBe(false);
    expect(sourceParses).toBe(parsesAfterCreate);
    expect(
      validator.final({ title: "Pasta", steps: [{ minutes: 4 }] }).card.valid,
    ).toBe(true);
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

  it("keeps each id on its own parser and matches a full partial check", () => {
    const push = createAgUiPartialValidator(recipe, configs);
    const fresh = createStreamValidator(recipe, configs);
    let buffer = "";
    const text = '{"title":"Pasta","servings":2,"steps":[{"text":"boil","minutes":4}]}';
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
        continue;
      }
      expect(outcome?.partial).toEqual(expected);
      const checked = fresh.partial(expected as never);
      expect(outcome?.results.card.valid).toBe(checked.card.valid);
      expect(outcome?.results.timer.valid).toBe(checked.timer.valid);
      expect(outcome?.results.card.errors === null).toBe(checked.card.errors === null);
    }
    expect(
      push({ type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "{" })?.partial,
    ).toEqual({});
  });
});

describe("createPartialJsonParser", () => {
  it("visits each character once and agrees with parsePartialJson", () => {
    const samples = [
      '{"title":"a\\',
      '{"a":"hi\\"',
      "1.0",
      "12",
      "[1,2]",
      '{"a":1,"b":2}',
      '{"a":{"b":12}}',
      " ",
      "x",
      "{]",
      "-0",
      "true",
      "[1,2,3]",
    ];
    for (const text of samples) {
      for (const width of [1, 2, text.length || 1]) {
        const parser = createPartialJsonParser();
        let buffer = "";
        for (let index = 0; index < text.length; index += width) {
          const piece = text.slice(index, index + width);
          buffer += piece;
          const got = parser.push(piece);
          const expected = parsePartialJson(buffer);
          expect(got).toEqual(expected);
          if (typeof expected === "number") expect(Object.is(got, expected)).toBe(true);
        }
        expect(parser.push("")).toEqual(parsePartialJson(text));
        expect(parser.visits).toBe(text.length);
      }
    }
  });
});

describe("partialPathIsValid", () => {
  it("checks only the value at the path", () => {
    expect(partialPathIsValid(recipe, { title: "Pasta" }, ["title"])).toBe(true);
    expect(partialPathIsValid(recipe, { title: 1 }, ["title"])).toBe(false);
    expect(partialPathIsValid(recipe, { title: "Pasta" }, [])).toBe(true);
    expect(partialPathIsValid(recipe, { servings: "x" }, [])).toBe(false);
    expect(partialPathIsValid(recipe, { extra: 1 }, ["extra"])).toBe(true);
    expect(partialPathIsValid(recipe, {}, ["title"])).toBe(true);
    expect(partialPathIsValid(recipe, { title: undefined }, ["title"])).toBe(true);
    expect(partialPathIsValid(recipe, { steps: "no" }, ["steps", 0])).toBe(true);
    expect(partialPathIsValid(recipe, { steps: [] }, ["steps", 0])).toBe(true);
    expect(
      partialPathIsValid(recipe, { steps: [{ minutes: 3 }] }, ["steps", 0, "minutes"]),
    ).toBe(true);
    expect(
      partialPathIsValid(recipe, { steps: [{ minutes: "x" }] }, ["steps", 0, "minutes"]),
    ).toBe(false);
    expect(partialPathIsValid(recipe, { title: null }, ["title", "extra"])).toBe(true);
    expect(partialPathIsValid(recipe, { title: "Pasta" }, ["title", "extra"])).toBe(true);
    expect(partialPathIsValid(recipe, "no", ["title"])).toBe(true);
    expect(partialPathIsValid(recipe, { title: "x" }, [0])).toBe(true);
    expect(partialPathIsValid(z.string(), "hi", ["missing"])).toBe(true);
    const wrapped = z.object({ title: z.string().optional() });
    expect(partialPathIsValid(wrapped, { title: "Pasta" }, ["title"])).toBe(true);
    expect(partialPathIsValid(wrapped, { title: 1 }, ["title"])).toBe(false);
  });
});

describe("createFrameThrottle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the latest value for the next animation frame", () => {
    const frames: Array<() => void> = [];
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      frames.push(callback);
      return frames.length;
    });
    const seen: string[] = [];
    const push = createFrameThrottle((value: string) => {
      seen.push(value);
    });
    push("one");
    push("two");
    expect(seen).toEqual([]);
    frames[0]?.();
    expect(seen).toEqual(["two"]);
    push("three");
    frames[1]?.();
    expect(seen).toEqual(["two", "three"]);
  });

  it("uses a zero-delay timer when animation frames are unavailable", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    vi.useFakeTimers();
    const seen: number[] = [];
    const push = createFrameThrottle((value: number) => {
      seen.push(value);
    });
    push(1);
    push(2);
    expect(seen).toEqual([]);
    vi.runAllTimers();
    expect(seen).toEqual([2]);
  });
});
