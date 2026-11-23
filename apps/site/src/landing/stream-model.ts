import { z } from "zod";

import { createStreamValidator } from "@adaptate/core/stream";
import { createAgUiPartialValidator } from "@adaptate/core/stream-incremental";

export let streamChunks = ['{"ti', 'tle":"Pas', 'ta al limone",', '"servings":', "4}"];
export let stillFrame = 1;

let recipe = z.object({ title: z.string().min(1), servings: z.number().int().min(1) }).partial();
let views = { card: { title: true }, kitchen: { title: true, servings: true } } as const;

export type StreamFrame = {
  step: string;
  text: string;
  parse: string;
  parsed: boolean;
  partial: string;
  card: boolean;
  kitchen: boolean;
};

function literal(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(literal).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    let entries = Object.entries(value).map(([key, item]) => `${key}: ${literal(item)}`);
    return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
  }
  if (typeof value === "string") return `'${value.replaceAll("'", "\\'")}'`;
  return String(value);
}

function parseOutcome(text: string): { parsed: boolean; parse: string } {
  try {
    JSON.parse(text);
    return { parsed: true, parse: "✓ parsed" };
  } catch (error) {
    return { parsed: false, parse: `✕ ${error instanceof Error ? error.name : "Error"}` };
  }
}

export function streamFrames(): StreamFrame[] {
  let push = createAgUiPartialValidator(recipe, views);
  let readiness = createStreamValidator(recipe, views);
  let text = "";
  let frames = streamChunks.map((delta, index) => {
    text += delta;
    let check = push({ type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta });
    let value = check?.partial ?? {};
    let ready = readiness.final(value);
    return {
      step: `chunk ${index + 1}/${streamChunks.length}`,
      text,
      ...parseOutcome(text),
      partial: literal(value),
      card: (check?.results.card.valid ?? false) && ready.card.valid,
      kitchen: (check?.results.kitchen.valid ?? false) && ready.kitchen.valid,
    };
  });
  push({ type: "TOOL_CALL_END", toolCallId: "call-1" });
  return frames;
}

export let readyText = (view: string, ready: boolean) => `${view} ${ready ? "ready" : "waiting"}`;
