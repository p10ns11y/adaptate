import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";

import { fromAsyncIterable } from "../stream-incremental";

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
