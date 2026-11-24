import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";

import {
  fromAsyncIterable,
  fromAsyncIterableSteps,
  isSettled,
  type JsonStreamStep,
} from "../stream-incremental";

const encoder = new TextEncoder();

async function collect(source: AsyncIterable<string | Uint8Array>) {
  const values: unknown[] = [];
  for await (const partialValue of fromAsyncIterable(source)) {
    values.push(partialValue);
  }
  return values;
}

describe("fromAsyncIterable", () => {
  it("joins a letter and an emoji split across byte chunks", async () => {
    const prefix = encoder.encode('{"name":"');
    const aring = encoder.encode("å");
    const emoji = encoder.encode("😀");
    const suffix = encoder.encode('"}');
    const values = await collect(
      (async function* splitBytes() {
        yield prefix;
        yield aring.subarray(0, 1);
        yield aring.subarray(1);
        yield emoji.subarray(0, 2);
        yield emoji.subarray(2);
        yield suffix;
      })(),
    );
    expect(values.at(-1)).toEqual({ name: "å😀" });
  });

  it("reads a Node Readable of strings", async () => {
    const values = await collect(
      Readable.from(["   ", '{"name":"Pa', 'sta"}']),
    );
    expect(values[0]).toEqual({ name: "Pa" });
    expect(values.at(-1)).toEqual({ name: "Pasta" });
  });

  it("reads a Web ReadableStream of bytes", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"name":"'));
        controller.enqueue(encoder.encode("å"));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      },
    });
    const values = await collect(stream);
    expect(values.at(-1)).toEqual({ name: "å" });
  });

  it("flushes a dangling byte into the open string", async () => {
    const values = await collect(
      (async function* openString() {
        yield encoder.encode('{"name":"');
        yield new Uint8Array([0xc3]);
      })(),
    );
    expect(values.at(-1)).toEqual({ name: "\uFFFD" });
  });

  it("flushes a dangling byte without yielding a value", async () => {
    const values = await collect(
      (async function* dangling() {
        yield new Uint8Array([0xc3]);
      })(),
    );
    expect(values).toEqual([]);
  });

  it("collects partials from a Node pipeline", async () => {
    const collected: unknown[] = [];
    await pipeline(
      Readable.from([encoder.encode('{"name":"'), encoder.encode('ok"}')]),
      async function collectPartials(source) {
        for await (const partialValue of fromAsyncIterable(source)) {
          collected.push(partialValue);
        }
      },
    );
    expect(collected.at(-1)).toEqual({ name: "ok" });
  });
});

describe("fromAsyncIterableSteps", () => {
  async function steps(source: AsyncIterable<string | Uint8Array>) {
    const seen: JsonStreamStep[] = [];
    for await (const step of fromAsyncIterableSteps(source)) seen.push(step);
    return seen;
  }

  it("marks the step where the root value closes", async () => {
    const seen = await steps(
      (async function* parts() {
        yield "  ";
        yield '{"name":"Pa';
        yield "";
        yield 'sta"}';
      })(),
    );
    expect(seen.map((step) => step.complete)).toEqual([false, true]);
    expect(seen.at(-1)?.value).toEqual({ name: "Pasta" });
  });

  async function frontiers(...parts: string[]) {
    return (
      await steps(
        (async function* source() {
          for (const part of parts) yield part;
        })(),
      )
    ).map(({ value, openPath, tailOpen }) => ({ value, openPath, tailOpen }));
  }

  it("keeps a cut-off string open until it closes", async () => {
    expect(await frontiers('{"comments":["c1","c', '2"]}')).toEqual([
      { value: { comments: ["c1", "c"] }, openPath: ["comments", 1], tailOpen: true },
      { value: { comments: ["c1", "c2"] }, openPath: [], tailOpen: false },
    ]);
  });

  it("keeps a number open while digits may follow", async () => {
    expect(await frontiers('{"n":12', '3,"m":4', "5}")).toEqual([
      { value: { n: 12 }, openPath: ["n"], tailOpen: true },
      { value: { n: 123, m: 4 }, openPath: ["m"], tailOpen: true },
      { value: { n: 123, m: 45 }, openPath: [], tailOpen: false },
    ]);
    expect(await frontiers("4", "2")).toEqual([
      { value: 4, openPath: [], tailOpen: true },
      { value: 42, openPath: [], tailOpen: true },
      { value: 42, openPath: [], tailOpen: false },
    ]);
  });

  it("walks nested objects and arrays", async () => {
    expect(
      await frontiers('{"a":{"b":[1,{"c":true', ',"d":"x', '"},[', "]]}}"),
    ).toEqual([
      { value: { a: { b: [1, { c: true }] } }, openPath: ["a", "b", 1, "c"], tailOpen: true },
      {
        value: { a: { b: [1, { c: true, d: "x" }] } },
        openPath: ["a", "b", 1, "d"],
        tailOpen: true,
      },
      { value: { a: { b: [1, { c: true, d: "x" }, []] } }, openPath: ["a", "b", 2], tailOpen: false },
      { value: { a: { b: [1, { c: true, d: "x" }, []] } }, openPath: [], tailOpen: false },
    ]);
    expect(await frontiers('{"a":1,"ke')).toEqual([
      { value: { a: 1 }, openPath: [], tailOpen: false },
    ]);
  });

  it("settles a path once the open path leaves it", async () => {
    const [step] = await steps(
      (async function* source() {
        yield '{"comments":["c1","c';
      })(),
    );
    const open = step as JsonStreamStep;
    expect(isSettled(open, ["comments", 0])).toBe(true);
    expect(isSettled(open, ["comments", 1])).toBe(false);
    expect(isSettled(open, ["comments"])).toBe(false);
    expect(isSettled(open, [])).toBe(false);
    expect(isSettled(open, ["missing"])).toBe(false);
    expect(isSettled(open, ["comments", 2])).toBe(false);
  });

  it("settles the root of a complete step and nothing absent", async () => {
    const seen = await steps(
      (async function* source() {
        yield '{"a":1,"b":';
        yield "[2]}";
      })(),
    );
    const [cut, whole] = seen as [JsonStreamStep, JsonStreamStep];
    expect(isSettled(cut, ["a"])).toBe(true);
    expect(isSettled(cut, ["b"])).toBe(false);
    expect(isSettled(cut, [])).toBe(false);
    expect(isSettled(whole, [])).toBe(true);
    expect(isSettled(whole, ["b", 0])).toBe(true);
    expect(isSettled(whole, ["c"])).toBe(false);
    expect(isSettled({ value: 1, complete: true }, [])).toBe(true);
    expect(isSettled({ value: { a: 1 }, complete: false }, ["a"])).toBe(false);
  });

  it("keeps a malformed string open and never settles it", async () => {
    for (const bad of ['{"a":"hel\nlo"}', '{"a":"hel\\qlo"}', '{"a":"he\\u12zz"}']) {
      const seen = await steps(
        (async function* source() {
          yield bad;
        })(),
      );
      const last = seen.at(-1) as JsonStreamStep;
      expect(last.complete).toBe(false);
      expect(last.openPath).toEqual(["a"]);
      expect(last.tailOpen).toBe(true);
      expect(isSettled(last, ["a"])).toBe(false);
    }
  });

  it("never commits a number glued to a non-delimiter", async () => {
    const glued = await frontiers('{"a":1.', "x}");
    expect(glued).toEqual([
      { value: { a: 1 }, openPath: ["a"], tailOpen: true },
      { value: { a: 1 }, openPath: ["a"], tailOpen: true },
    ]);
    const split = await steps(
      (async function* source() {
        yield '{"a":1.';
        yield "x}";
      })(),
    );
    expect(split.map((step) => step.complete)).toEqual([false, false]);
    expect(isSettled(split.at(-1) as JsonStreamStep, ["a"])).toBe(false);
    for (const bad of ['{"a":12-3}', '{"a":12:', '{"a":1"b"}', "[7{"]) {
      const [last] = await steps(
        (async function* source() {
          yield bad;
        })(),
      );
      const step = last as JsonStreamStep;
      expect(step.complete).toBe(false);
      expect(step.tailOpen).toBe(true);
      expect(isSettled(step, step.openPath as (string | number)[])).toBe(false);
    }
    expect(await frontiers('{"a":12 ,"b":3]')).toEqual([
      { value: { a: 12, b: 3 }, openPath: [], tailOpen: false },
    ]);
    expect(await frontiers("[7 {")).toEqual([
      { value: [7], openPath: [], tailOpen: false },
    ]);
  });

  it("never commits a keyword glued to a non-delimiter", async () => {
    for (const [bad, path] of [
      ['{"a":truex}', ["a"]],
      ["[true1]", [0]],
      ["nullx", []],
      ["falsey", []],
      ['{"a":true"b"}', ["a"]],
    ] as const) {
      const seen = await steps(
        (async function* source() {
          yield bad;
        })(),
      );
      const last = seen.at(-1) as JsonStreamStep;
      expect(last.complete).toBe(false);
      expect(last.openPath).toEqual(path);
      expect(last.tailOpen).toBe(true);
      expect(isSettled(last, path)).toBe(false);
    }
    expect(await frontiers('{"a":true', "x}")).toEqual([
      { value: { a: true }, openPath: ["a"], tailOpen: true },
      { value: { a: true }, openPath: ["a"], tailOpen: true },
    ]);
    const split = await steps(
      (async function* source() {
        yield '{"a":true';
        yield "x}";
      })(),
    );
    expect(split.map((step) => step.complete)).toEqual([false, false]);
    expect(split.some((step) => isSettled(step, ["a"]))).toBe(false);
  });

  it("commits a keyword once a delimiter follows it", async () => {
    expect(await frontiers('{"a":nul', "l", ',"b":false}')).toEqual([
      { value: {}, openPath: [], tailOpen: false },
      { value: { a: null }, openPath: ["a"], tailOpen: true },
      { value: { a: null, b: false }, openPath: [], tailOpen: false },
    ]);
    expect(await frontiers("tr", "ue")).toEqual([
      { value: true, openPath: [], tailOpen: true },
      { value: true, openPath: [], tailOpen: false },
    ]);
    const root = await steps(
      (async function* source() {
        yield "true";
      })(),
    );
    expect(root.map((step) => step.complete)).toEqual([false, true]);
  });

  it("lets a later duplicate key replace a value it called settled", async () => {
    const seen = await steps(
      (async function* source() {
        yield '{"a":1,';
        yield '"a":2}';
      })(),
    );
    const [first, last] = seen as [JsonStreamStep, JsonStreamStep];
    expect(isSettled(first, ["a"])).toBe(true);
    expect(first.value).toEqual({ a: 1 });
    expect(last).toEqual({ value: { a: 2 }, complete: true });
    expect(last.value).toEqual(JSON.parse('{"a":1,"a":2}'));
  });

  it("takes integer index keys for arrays and string keys for objects", () => {
    let done: JsonStreamStep = { value: { tags: ["x"], 0: "y" }, complete: true };
    expect(isSettled(done, ["tags", 0])).toBe(true);
    expect(isSettled(done, ["tags", "length"])).toBe(false);
    expect(isSettled(done, ["tags", "0"])).toBe(false);
    expect(isSettled(done, ["tags", 0.5])).toBe(false);
    expect(isSettled(done, ["tags", -1])).toBe(false);
    expect(isSettled(done, ["tags", 1])).toBe(false);
    expect(isSettled(done, ["0"])).toBe(true);
    expect(isSettled(done, [0])).toBe(false);
    done = { value: { a: null, b: 1 }, complete: true };
    expect(isSettled(done, ["a"])).toBe(true);
    expect(isSettled(done, ["a", "x"])).toBe(false);
    expect(isSettled(done, ["b", "x"])).toBe(false);
  });

  it("keeps the frontier out of keys and JSON", async () => {
    const [step] = await steps(
      (async function* source() {
        yield '{"a":"x';
      })(),
    );
    expect(Object.keys(step as object)).toEqual(["value", "complete"]);
    expect(JSON.stringify(step)).toBe('{"value":{"a":"x"},"complete":false}');
  });

  it("flushes a dangling byte as an open step", async () => {
    const seen = await steps(
      (async function* openString() {
        yield encoder.encode('{"name":"');
        yield new Uint8Array([0xc3]);
      })(),
    );
    expect(seen.at(-1)).toEqual({ value: { name: "\uFFFD" }, complete: false });
    expect(
      await steps(
        (async function* dangling() {
          yield new Uint8Array([0xc3]);
        })(),
      ),
    ).toEqual([]);
  });
});
