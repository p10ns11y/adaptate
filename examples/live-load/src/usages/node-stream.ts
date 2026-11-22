import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fromAsyncIterable } from "@adaptate/core/stream-incremental";

export type OpenAiToolChunk = {
  choices?: Array<{
    delta?: {
      tool_calls?: Array<{
        function?: {
          arguments?: string;
        };
      }>;
    };
  }>;
};

export type AnthropicInputChunk = {
  delta?: {
    type?: string;
    partial_json?: string;
  };
};

export async function* openAiArguments(
  events: AsyncIterable<OpenAiToolChunk>,
): AsyncGenerator<string> {
  for await (let event of events) {
    let delta = event.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments;
    if (typeof delta === "string" && delta.length > 0) yield delta;
  }
}

export async function* anthropicInputJson(
  events: AsyncIterable<AnthropicInputChunk>,
): AsyncGenerator<string> {
  for await (let event of events) {
    let delta = event.delta;
    if (
      delta?.type === "input_json_delta" &&
      typeof delta.partial_json === "string" &&
      delta.partial_json.length > 0
    ) {
      yield delta.partial_json;
    }
  }
}

export async function collectNodeStream(readable: Readable): Promise<unknown[]> {
  let partials: unknown[] = [];
  await pipeline(readable, async function collect(source) {
    for await (let partialValue of fromAsyncIterable(source as AsyncIterable<string | Uint8Array>)) {
      partials.push(partialValue);
    }
  });
  return partials;
}
