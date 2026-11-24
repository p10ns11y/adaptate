import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { z } from "zod";

import { createStreamValidator, parsePartialJson } from "../stream";
import {
  createAgUiPartialValidator,
  createPartialJsonFeed,
  fromAsyncIterableSteps,
  isSettled,
  type JsonStreamStep,
} from "../stream-incremental";
import { createPartialJsonParser } from "./partial-json-parser";

const recipe = z.object({
  title: z.string(),
  servings: z.number(),
  steps: z.array(z.object({ text: z.string(), minutes: z.number() })),
});

const configs = {
  card: { title: true },
  timer: { steps: { "*": { minutes: true } } },
};

function sameValue(got: unknown, expected: unknown): boolean {
  if (Object.is(got, expected)) return true;
  if (typeof got !== "object" || typeof expected !== "object") return false;
  if (got === null || expected === null) return false;
  if (Array.isArray(got) || Array.isArray(expected)) {
    if (!Array.isArray(got) || !Array.isArray(expected)) return false;
    if (got.length !== expected.length) return false;
    return got.every((item, index) => sameValue(item, expected[index]));
  }
  const gotRecord = got as Record<string, unknown>;
  const expectedRecord = expected as Record<string, unknown>;
  const gotKeys = Object.keys(gotRecord);
  const expectedKeys = Object.keys(expectedRecord);
  if (gotKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every((key) => sameValue(gotRecord[key], expectedRecord[key]));
}

describe("incremental partial JSON", () => {
  it("matches a full re-parse at every chunk boundary", () => {
    fc.assert(
      fc.property(
        fc.jsonValue({ maxDepth: 4 }),
        fc.integer({ min: 0, max: 80 }),
        fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 24 }),
        (value, prefixCut, widths) => {
          const full = JSON.stringify(value);
          const text = full.slice(0, prefixCut % (full.length + 1));
          const parser = createPartialJsonParser();
          let buffer = "";
          let widthIndex = 0;
          while (buffer.length < text.length) {
            const width = widths[widthIndex % Math.max(widths.length, 1)] ?? 1;
            widthIndex += 1;
            const piece = text.slice(buffer.length, buffer.length + Math.max(width, 1));
            buffer += piece;
            const got = parser.push(piece);
            expect(parser.visits).toBe(buffer.length);
            expect(sameValue(got, parsePartialJson(buffer))).toBe(true);
            const again = parser.push("");
            expect(parser.visits).toBe(buffer.length);
            expect(sameValue(again, parsePartialJson(buffer))).toBe(true);
          }
          const doubled = parser.push(text);
          expect(parser.visits).toBe(buffer.length + text.length);
          expect(sameValue(doubled, parsePartialJson(text + text))).toBe(true);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("agrees with a full partial check on every AG-UI chunk", () => {
    fc.assert(
      fc.property(
        fc.record({
          title: fc.string({ maxLength: 12 }),
          servings: fc.integer({ min: -20, max: 20 }),
          steps: fc.array(
            fc.record({
              text: fc.string({ maxLength: 8 }),
              minutes: fc.integer({ min: 0, max: 30 }),
            }),
            { maxLength: 2 },
          ),
        }),
        fc.integer({ min: 1, max: 7 }),
        (value, width) => {
          const text = JSON.stringify(value);
          const push = createAgUiPartialValidator(recipe, configs);
          const fresh = createStreamValidator(recipe, configs);
          let buffer = "";
          for (let index = 0; index < text.length; index += width) {
            const piece = text.slice(index, index + width);
            buffer += piece;
            const outcome = push({
              type: "TOOL_CALL_ARGS",
              toolCallId: "call",
              delta: piece,
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
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("matches a re-parse of non-canonical text, including own __proto__", () => {
    const gap = fc.string({ unit: fc.constantFrom(" ", "\t", "\n"), maxLength: 2 });
    const encodedString = fc
      .tuple(
        fc.string({ unit: fc.constantFrom("a", "b", "A", " ", "/"), maxLength: 4 }),
        fc.boolean(),
      )
      .map(([text, uppercaseHex]) => {
        let body = '"';
        for (const character of text) {
          if (character === "/") body += "\\/";
          else if (character === "A") body += uppercaseHex ? "\\u0041" : "A";
          else body += character;
        }
        return `${body}"`;
      });
    const keyName = fc.constantFrom("a", "b", "__proto__", "constructor");
    const jsonText: fc.Arbitrary<string> = fc.letrec((tie) => ({
      node: fc.oneof(
        { maxDepth: 4, depthIdentifier: "json" },
        encodedString,
        fc.constantFrom("null", "true", "false", "0", "-0", "1", "1e2", "1E+1"),
        fc.tuple(gap, fc.array(tie("node"), { maxLength: 3 }), gap).map(([left, items, right]) => {
          return `${left}[${items.join(",")}]${right}`;
        }),
        fc
          .tuple(
            gap,
            fc.array(fc.tuple(keyName, tie("node"), gap), { maxLength: 3 }),
            gap,
          )
          .map(([left, entries, right]) => {
            const members = entries.map(([key, node, between]) => {
              const nodeText = node as string;
              return `${JSON.stringify(key)}:${between}${nodeText}`;
            });
            return `${left}{${members.join(",")}}${right}`;
          }),
      ),
    })).node;
    fc.assert(
      fc.property(jsonText, fc.integer({ min: 1, max: 5 }), (text, width) => {
        const parser = createPartialJsonParser();
        let buffer = "";
        let last: unknown;
        for (let index = 0; index < text.length; index += width) {
          const piece = text.slice(index, index + width);
          buffer += piece;
          last = parser.push(piece);
          expect(sameValue(last, parsePartialJson(buffer))).toBe(true);
        }
        try {
          const parsed = JSON.parse(text) as unknown;
          expect(sameValue(last, parsed)).toBe(true);
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            Object.hasOwn(parsed, "__proto__")
          ) {
            expect(Object.getPrototypeOf(last)).toBe(Object.prototype);
          }
        } catch {
          expect(buffer).toBe(text);
        }
      }),
      { numRuns: 30 },
    );
  });

  it("leaves earlier snapshots unchanged across later chunks", () => {
    const feed = createPartialJsonFeed();
    const first = feed('{"a":{"b":{"c":"x');
    const firstText = JSON.stringify(first);
    const second = feed("yz");
    expect(JSON.stringify(first)).toBe(firstText);
    expect(first).toEqual({ a: { b: { c: "x" } } });
    expect(second).toEqual({ a: { b: { c: "xyz" } } });
    fc.assert(
      fc.property(
        fc.jsonValue({ maxDepth: 4 }),
        fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 8 }),
        (value, widths) => {
          const text = JSON.stringify(value);
          const partialFeed = createPartialJsonFeed();
          const snapshots: unknown[] = [];
          const frozen: string[] = [];
          let cursor = 0;
          let widthIndex = 0;
          while (cursor < text.length) {
            const width = widths[widthIndex % widths.length] ?? 1;
            widthIndex += 1;
            const got = partialFeed(text.slice(cursor, cursor + width));
            cursor += width;
            for (let earlier = 0; earlier < snapshots.length; earlier += 1) {
              expect(JSON.stringify(snapshots[earlier])).toBe(frozen[earlier]);
            }
            if (got !== undefined) {
              snapshots.push(got);
              frozen.push(JSON.stringify(got));
            }
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("joins a split surrogate pair at every offset", () => {
    const source = '"\\ud83d\\ude00"';
    for (let cut = 0; cut <= source.length; cut += 1) {
      const feed = createPartialJsonFeed();
      let buffer = "";
      for (const piece of [source.slice(0, cut), source.slice(cut)]) {
        if (piece.length === 0) continue;
        buffer += piece;
        expect(feed(piece)).toEqual(parsePartialJson(buffer));
      }
      expect(feed("")).toBe("😀");
    }
  });

  it("parses ten thousand nested objects without a recursive walk", () => {
    let text = "";
    for (let depth = 0; depth < 10000; depth += 1) text += '{"a":';
    text += "1";
    for (let depth = 0; depth < 10000; depth += 1) text += "}";
    const parser = createPartialJsonParser();
    let value: unknown;
    for (let index = 0; index < text.length; index += 250) {
      value = parser.push(text.slice(index, index + 250));
    }
    let cursor = value as { a?: unknown };
    for (let depth = 0; depth < 10000; depth += 1) {
      cursor = cursor.a as { a?: unknown };
    }
    expect(cursor).toBe(1);
    expect(parser.visits).toBe(text.length);
  });
});

describe("open path", () => {
  function valueAt(root: unknown, path: ReadonlyArray<string | number>): unknown {
    let cursor = root;
    for (const key of path) cursor = (cursor as Record<string | number, unknown>)[key];
    return cursor;
  }

  function checkSettled(step: JsonStreamStep, final: unknown, path: Array<string | number>): void {
    const here = valueAt(step.value, path);
    if (isSettled(step, path)) {
      expect(sameValue(here, valueAt(final, path)), JSON.stringify(path)).toBe(true);
      return;
    }
    if (typeof here !== "object" || here === null) return;
    const keys = Array.isArray(here) ? here.map((_, index) => index) : Object.keys(here);
    for (const key of keys) checkSettled(step, final, [...path, key]);
  }

  function chunked(text: string, widths: number[]): AsyncIterable<string> {
    return (async function* chunks() {
      let at = 0;
      let widthIndex = 0;
      while (at < text.length) {
        const width = widths[widthIndex % Math.max(widths.length, 1)] ?? text.length;
        widthIndex += 1;
        yield text.slice(at, at + width);
        at += width;
      }
    })();
  }

  // Offsets inside string literals where an insert cannot split an escape sequence.
  function stringInteriors(text: string): number[] {
    const offsets: number[] = [];
    let inString = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (!inString) {
        if (character === '"') inString = true;
        continue;
      }
      offsets.push(index);
      if (character === "\\") {
        index += text[index + 1] === "u" ? 5 : 1;
        continue;
      }
      if (character === '"') inString = false;
    }
    return offsets;
  }

  // Offsets just past a number or keyword, where a glued character breaks the token.
  function scalarEnds(text: string): number[] {
    const offsets: number[] = [];
    const token = /[\w.+-]/;
    let inString = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index] as string;
      if (inString) {
        if (character === "\\") index += 1;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (token.test(character) && !token.test(text[index + 1] ?? "")) offsets.push(index + 1);
    }
    return offsets;
  }

  it("keeps every value off the open path equal to its final value", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.jsonValue({ maxDepth: 4 }),
        fc.array(fc.integer({ min: 1, max: 9 }), { maxLength: 24 }),
        async (value, widths) => {
          const text = JSON.stringify(value);
          const final = JSON.parse(text) as unknown;
          let last: JsonStreamStep | undefined;
          for await (const step of fromAsyncIterableSteps(chunked(text, widths))) {
            checkSettled(step, final, []);
            if (step.tailOpen) {
              const tail = valueAt(step.value, step.openPath ?? []);
              expect(tail === null ? "null" : typeof tail).toMatch(/^(string|number|boolean|null)$/);
            }
            last = step;
          }
          expect(last).toMatchObject({ complete: true, openPath: [], tailOpen: false });
          expect(sameValue(last?.value, final)).toBe(true);
          expect(isSettled(last as JsonStreamStep, [])).toBe(true);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("never settles a value cut by a malformed string", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.jsonValue({ maxDepth: 4 }),
        fc.nat(),
        fc.constantFrom("\n", "\t", "\u0001", "\\q", "\\u12zz"),
        fc.array(fc.integer({ min: 1, max: 9 }), { maxLength: 24 }),
        async (value, pick, flaw, widths) => {
          const text = JSON.stringify(value);
          const offsets = stringInteriors(text);
          fc.pre(offsets.length > 0);
          const at = offsets[pick % offsets.length] as number;
          const broken = text.slice(0, at) + flaw + text.slice(at);
          const final = JSON.parse(text) as unknown;
          let last: JsonStreamStep | undefined;
          for await (const step of fromAsyncIterableSteps(chunked(broken, widths))) {
            checkSettled(step, final, []);
            last = step;
          }
          if (!last) return;
          expect(last.complete).toBe(false);
          expect(isSettled(last, [])).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never settles a number or keyword glued to a non-delimiter", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.jsonValue({ maxDepth: 4 }),
        fc.nat(),
        fc.constantFrom("x", ".", "-", "+", "e", '"', ":", "{", "["),
        fc.array(fc.integer({ min: 1, max: 9 }), { maxLength: 24 }),
        async (value, pick, glue, widths) => {
          const text = JSON.stringify(value);
          const offsets = scalarEnds(text);
          fc.pre(offsets.length > 0);
          const at = offsets[pick % offsets.length] as number;
          const broken = text.slice(0, at) + glue + text.slice(at);
          const final = JSON.parse(text) as unknown;
          let last: JsonStreamStep | undefined;
          for await (const step of fromAsyncIterableSteps(chunked(broken, widths))) {
            checkSettled(step, final, []);
            last = step;
          }
          expect(last?.complete).toBe(false);
          expect(isSettled(last as JsonStreamStep, [])).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
