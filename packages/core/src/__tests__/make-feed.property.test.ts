import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { z } from "zod";

import { parseStream } from "../result";
import {
  createTrackedFeed,
  fromAsyncIterableSteps,
  type TrackedFeed,
  type TrackedStep,
} from "../stream-incremental";

async function* chunks(...parts: string[]) {
  for (const part of parts) yield part;
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const seen: T[] = [];
  for await (const item of source) seen.push(item);
  return seen;
}

function wrapDefault(): TrackedFeed {
  const inner = createTrackedFeed();
  return {
    push: (chunk) => inner.push(chunk),
    complete: () => inner.complete(),
    ended: () => inner.ended(),
    openPath: () => inner.openPath(),
    tailOpen: () => inner.tailOpen(),
  };
}

function frontier(step: TrackedStep) {
  return {
    value: step.value,
    complete: step.complete,
    openPath: [...step.openPath],
    tailOpen: step.tailOpen,
  };
}

function splitText(text: string, cuts: number[]): string[] {
  const points = [...new Set(cuts.map((cut) => Math.max(0, Math.min(text.length, cut))))]
    .sort((left, right) => left - right);
  const parts: string[] = [];
  let start = 0;
  for (const point of points) {
    if (point > start) parts.push(text.slice(start, point));
    start = point;
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts.length === 0 ? [text] : parts;
}

const jsonValue = fc.oneof(
  { depthSize: "small", maxDepth: 3 },
  fc.constant(null),
  fc.boolean(),
  fc.integer({ min: -1e6, max: 1e6 }),
  fc.string({ maxLength: 24 }),
  fc.array(fc.integer({ min: -100, max: 100 }), { maxLength: 4 }),
  fc.dictionary(fc.stringMatching(/^[A-Za-z][A-Za-z0-9_]{0,8}$/), fc.integer({ min: 0, max: 99 }), {
    maxKeys: 4,
  }),
);

describe("makeFeed properties", () => {
  it("keeps default and wrapping feeds on the same frontiers for any chunking", async () => {
    await fc.assert(
      fc.asyncProperty(jsonValue, fc.array(fc.nat({ max: 200 }), { maxLength: 8 }), async (value, cuts) => {
        const text = JSON.stringify(value);
        const parts = splitText(text, cuts);
        const defaults = await collect(fromAsyncIterableSteps(chunks(...parts)));
        const wrapped = await collect(
          fromAsyncIterableSteps(chunks(...parts), wrapDefault),
        );
        expect(wrapped.map(frontier)).toEqual(defaults.map(frontier));
        const defaultStream = await collect(parseStream(chunks(...parts), z.unknown()));
        const wrappedStream = await collect(
          parseStream(chunks(...parts), z.unknown(), undefined, wrapDefault),
        );
        expect(
          wrappedStream.map(({ done, openPath, tailOpen, result }) => ({
            done,
            openPath,
            tailOpen,
            ok: result.ok,
            value: result.ok ? result.value : result.error,
          })),
        ).toEqual(
          defaultStream.map(({ done, openPath, tailOpen, result }) => ({
            done,
            openPath,
            tailOpen,
            ok: result.ok,
            value: result.ok ? result.value : result.error,
          })),
        );
      }),
      { numRuns: 40 },
    );
  });
});
