import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { z } from "zod";

import { createStreamValidator, parsePartialJson } from "../stream";
import { createAgUiPartialValidator, createPartialJsonFeed } from "../stream-incremental";
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
