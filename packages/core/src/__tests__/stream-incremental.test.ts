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
      { value: { a: { b: [1, { c: true }] } }, openPath: ["a", "b", 1], tailOpen: false },
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
    let [step] = await steps(
      (async function* source() {
        yield '{"comments":["c1","c';
      })(),
    );
    let open = step as JsonStreamStep;
    expect(isSettled(open, ["comments", 0])).toBe(true);
    expect(isSettled(open, ["comments", 1])).toBe(false);
    expect(isSettled(open, ["comments"])).toBe(false);
    expect(isSettled(open, [])).toBe(false);
  });

  it("flushes a dangling byte as an open step", async () => {
    const seen = await steps(
      (async function* openString() {
        yield encoder.encode('{"name":"');
        yield new Uint8Array([0xc3]);
      })(),
    );
    expect(seen.at(-1)).toEqual({
      value: { name: "\uFFFD" },
      complete: false,
      openPath: ["name"],
      tailOpen: true,
    });
    expect(
      await steps(
        (async function* dangling() {
          yield new Uint8Array([0xc3]);
        })(),
      ),
    ).toEqual([]);
  });
});
