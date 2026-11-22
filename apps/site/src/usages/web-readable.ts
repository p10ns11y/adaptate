import { fromAsyncIterable } from "@adaptate/core/stream-incremental";

export async function* iterateReadable(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  let reader = stream.getReader();
  try {
    for (;;) {
      let step = await reader.read();
      if (step.done) return;
      if (step.value) yield step.value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function collectWebStream(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  let partials: unknown[] = [];
  for await (let partialValue of fromAsyncIterable(iterateReadable(stream))) {
    partials.push(partialValue);
  }
  return partials;
}
