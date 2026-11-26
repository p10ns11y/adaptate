import { describe, expect, it } from "vitest";
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

function frontier(step: TrackedStep) {
  return {
    value: step.value,
    complete: step.complete,
    openPath: step.openPath,
    tailOpen: step.tailOpen,
  };
}

function wrappingFeed(): TrackedFeed & { pushes: number } {
  const inner = createTrackedFeed();
  const feed: TrackedFeed & { pushes: number } = {
    pushes: 0,
    push(chunk) {
      feed.pushes += 1;
      return inner.push(chunk);
    },
    complete: () => inner.complete(),
    ended: () => inner.ended(),
    openPath: () => inner.openPath(),
    tailOpen: () => inner.tailOpen(),
  };
  return feed;
}

describe("fromAsyncIterableSteps makeFeed", () => {
  it("uses the default tracked feed when makeFeed is omitted", async () => {
    const seen = await collect(
      fromAsyncIterableSteps(chunks('{"tags":["c1","c', '2"]}')),
    );
    expect(seen.map(frontier)).toEqual([
      {
        value: { tags: ["c1", "c"] },
        complete: false,
        openPath: ["tags", 1],
        tailOpen: true,
      },
      {
        value: { tags: ["c1", "c2"] },
        complete: true,
        openPath: [],
        tailOpen: false,
      },
    ]);
  });

  it("preserves openPath and tailOpen through a custom wrapping feed", async () => {
    const wrapped = wrappingFeed();
    const custom = await collect(
      fromAsyncIterableSteps(chunks('{"n":12', '3,"m":4', "5}"), () => wrapped),
    );
    const defaults = await collect(
      fromAsyncIterableSteps(chunks('{"n":12', '3,"m":4', "5}")),
    );
    expect(custom.map(frontier)).toEqual(defaults.map(frontier));
    expect(wrapped.pushes).toBe(3);
  });

  it("lets a custom feed supply its own frontier", async () => {
    const feed: TrackedFeed = {
      push: () => ({ custom: true }),
      complete: () => true,
      ended: () => true,
      openPath: () => ["custom"],
      tailOpen: () => false,
    };
    const seen = await collect(fromAsyncIterableSteps(chunks("{}"), () => feed));
    expect(seen.map(frontier)).toEqual([
      {
        value: { custom: true },
        complete: true,
        openPath: ["custom"],
        tailOpen: false,
      },
    ]);
  });
});

describe("parseStream makeFeed", () => {
  it("matches the default frontier when makeFeed is omitted", async () => {
    const steps = await collect(
      parseStream(chunks('{"tags":["c1","c', '2"]}'), z.unknown()),
    );
    expect(
      steps.map(({ done, openPath, tailOpen, result }) => ({
        done,
        openPath,
        tailOpen,
        ok: result.ok,
        value: result.ok ? result.value : undefined,
      })),
    ).toEqual([
      {
        done: false,
        openPath: ["tags", 1],
        tailOpen: true,
        ok: true,
        value: { tags: ["c1", "c"] },
      },
      {
        done: false,
        openPath: [],
        tailOpen: false,
        ok: true,
        value: { tags: ["c1", "c2"] },
      },
      {
        done: true,
        openPath: [],
        tailOpen: false,
        ok: true,
        value: { tags: ["c1", "c2"] },
      },
    ]);
  });

  it("threads a custom feed and keeps openPath and tailOpen", async () => {
    const wrapped = wrappingFeed();
    const custom = await collect(
      parseStream(
        chunks('{"title":"Pas', 'ta"}'),
        z.unknown(),
        undefined,
        () => wrapped,
      ),
    );
    const defaults = await collect(
      parseStream(chunks('{"title":"Pas', 'ta"}'), z.unknown()),
    );
    expect(
      custom.map(({ done, openPath, tailOpen, result }) => ({
        done,
        openPath,
        tailOpen,
        ok: result.ok,
        value: result.ok ? result.value : result.error,
      })),
    ).toEqual(
      defaults.map(({ done, openPath, tailOpen, result }) => ({
        done,
        openPath,
        tailOpen,
        ok: result.ok,
        value: result.ok ? result.value : result.error,
      })),
    );
    expect(wrapped.pushes).toBe(2);
  });
});
