import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { z } from "zod";

import {
  createAgUiPartialValidator,
  createPartialJsonParser,
  createStreamValidator,
  parsePartialJson,
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
});
