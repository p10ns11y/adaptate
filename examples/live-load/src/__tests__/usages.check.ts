import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

import { OrderCard } from "../usages/react-view";
import { openApiCardReady } from "../usages/openapi";
import { createReparseOrderValidator } from "../usages/ag-ui";
import {
  anthropicInputJson,
  collectNodeStream,
  openAiArguments,
} from "../usages/node-stream";
import { collectWebStream } from "../usages/web-readable";
import { attachEventSource, frameSseData, readSse } from "../usages/sse";
import { checkTanStackStream } from "../usages/tanstack";

describe("usage snippets", () => {
  it("renders the React card from the title", () => {
    let ready = renderToStaticMarkup(createElement(OrderCard, { order: { title: "Batch 1" } }));
    let waiting = renderToStaticMarkup(createElement(OrderCard, { order: {} }));
    expect(ready).toBe("<p>Batch 1</p>");
    expect(waiting).toBe("<p>The card is not ready.</p>");
  });

  it("checks the OpenAPI card", () => {
    expect(openApiCardReady({ title: "Batch 1" })).toBe(true);
    expect(openApiCardReady({})).toBe(false);
  });

  it("checks an AG-UI delta", () => {
    let push = createReparseOrderValidator();
    let outcome = push({
      type: "TOOL_CALL_ARGS",
      toolCallId: "call-1",
      delta: '{"title":"Batch 1"',
    });
    expect(outcome?.partial).toEqual({ title: "Batch 1" });
    expect(outcome?.results.card.valid).toBe(true);
  });

  it("reads a Node pipeline and the provider deltas", async () => {
    let readable = Readable.from([new TextEncoder().encode('{"title":"Batch 1"')]);
    let partials = await collectNodeStream(readable);
    expect(partials.at(-1)).toEqual({ title: "Batch 1" });
    let openAi = openAiArguments(
      (async function* () {
        yield { choices: [{ delta: { tool_calls: [{ function: { arguments: '{"title":' } }] } }] };
      })(),
    );
    let anthropic = anthropicInputJson(
      (async function* () {
        yield { delta: { type: "input_json_delta", partial_json: '"Batch"' } };
      })(),
    );
    expect(await openAi.next()).toMatchObject({ value: '{"title":' });
    expect(await anthropic.next()).toMatchObject({ value: '"Batch"' });
  });

  it("reads a web ReadableStream", async () => {
    let stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"title":"Batch 1"'));
        controller.close();
      },
    });
    let partials = await collectWebStream(stream);
    expect(partials.at(-1)).toEqual({ title: "Batch 1" });
  });

  it("reads SSE from fetch bytes and EventSource messages", async () => {
    let seen: string[] = [];
    await readSse(new Response(frameSseData('{"title":"Batch 1"')), (delta) => {
      seen.push(delta);
    });
    expect(seen).toEqual(['{"title":"Batch 1"']);
    let listeners = new Map<string, (event: MessageEvent) => void>();
    let source = {
      addEventListener(type: string, listener: EventListener) {
        listeners.set(type, listener as (event: MessageEvent) => void);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
    } as unknown as EventSource;
    let messages: string[] = [];
    let detach = attachEventSource(source, (delta) => {
      messages.push(delta);
    });
    listeners.get("message")?.({ data: '{"title":"P"' } as MessageEvent["data"]);
    listeners.get("message")?.({ data: "[DONE]" } as MessageEvent["data"]);
    detach();
    expect(messages).toEqual(['{"title":"P"']);
  });

  it("maps a TanStack partial and final", () => {
    expect(checkTanStackStream({ partial: null, final: null })).toEqual({
      partial: null,
      final: null,
    });
    let partial = checkTanStackStream({ partial: { title: "Batch 1" }, final: null });
    expect(partial.partial?.card.valid).toBe(true);
    expect(partial.final).toBeNull();
    let finalReport = checkTanStackStream({
      partial: null,
      final: {
        title: "Batch 1",
        notes: "note",
        items: [{ sku: "sku-0000", qty: 1 }],
      },
    });
    expect(finalReport.final?.card.valid).toBe(true);
  });
});
