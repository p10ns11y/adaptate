export type ProtocolName = "ag-ui" | "openai" | "anthropic";

export type LoadChunk = {
  protocol: ProtocolName;
  toolCallId: string;
  delta: string;
  atMs: number;
};

export type LoadScriptOptions = {
  durationMs?: number;
  seed?: number;
  noteChars?: number;
  itemCount?: number;
  callCount?: number;
};

export let defaultRunMs = 60_000;
export let defaultNoteChars = 20_000;
export let defaultItemCount = 1_000;
export let defaultCallCount = 4;
export let loadSeed = 0x51a7e;

let protocols: ProtocolName[] = ["ag-ui", "openai", "anthropic"];
let noteAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789 ";
let smallSliceFloor = 24;
let smallSliceSpan = 40;
let largeSliceFloor = 800;
let largeSliceSpan = 400;
let smallSliceLimit = 24_000;

export function buildLoadScript(options: LoadScriptOptions = {}): LoadChunk[] {
  let durationMs = options.durationMs ?? defaultRunMs;
  let seed = options.seed ?? loadSeed;
  let noteChars = options.noteChars ?? defaultNoteChars;
  let itemCount = options.itemCount ?? defaultItemCount;
  let callCount = options.callCount ?? defaultCallCount;
  let nextUnit = createUnit(seed);
  let documents = [];
  for (let callIndex = 0; callIndex < callCount; callIndex += 1) {
    let protocol = protocols[callIndex % protocols.length] ?? "ag-ui";
    documents.push({
      protocol,
      toolCallId: `call-${callIndex + 1}`,
      slices: sliceDocument(
        buildOrderDocument(callIndex, noteChars, itemCount, nextUnit),
        nextUnit,
      ),
    });
  }
  let mixed: LoadChunk[] = [];
  let cursors = documents.map(() => 0);
  let pending = true;
  while (pending) {
    pending = false;
    for (let callIndex = 0; callIndex < documents.length; callIndex += 1) {
      let document = documents[callIndex];
      if (!document) continue;
      let cursor = cursors[callIndex] ?? 0;
      let delta = document.slices[cursor];
      if (delta === undefined) continue;
      cursors[callIndex] = cursor + 1;
      pending = true;
      mixed.push({
        protocol: document.protocol,
        toolCallId: document.toolCallId,
        delta,
        atMs: 0,
      });
    }
  }
  if (mixed.length === 0) return mixed;
  let step = durationMs / mixed.length;
  for (let index = 0; index < mixed.length; index += 1) {
    let chunk = mixed[index];
    if (!chunk) continue;
    chunk.atMs = Math.min(durationMs - 1, Math.round(index * step));
  }
  return mixed;
}

export function describeChunk(chunk: LoadChunk): string {
  let clipped = clipText(chunk.delta, 64);
  if (chunk.protocol === "ag-ui") {
    return JSON.stringify({
      type: "TOOL_CALL_ARGS",
      toolCallId: chunk.toolCallId,
      delta: clipped,
    });
  }
  if (chunk.protocol === "openai") {
    return JSON.stringify({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: clipped } }] } }],
    });
  }
  if (chunk.protocol === "anthropic") {
    return JSON.stringify({
      delta: { type: "input_json_delta", partial_json: clipped },
    });
  }
  let unexpected: never = chunk.protocol;
  return unexpected;
}

export function protocolLabel(protocol: ProtocolName): string {
  if (protocol === "ag-ui") return "AG-UI";
  if (protocol === "openai") return "OpenAI";
  if (protocol === "anthropic") return "Anthropic";
  let unexpected: never = protocol;
  return unexpected;
}

export function clipText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…`;
}

export function isChunkMessage(value: unknown): value is LoadChunk & { kind: "chunk" } {
  if (!value || typeof value !== "object") return false;
  let record = value as Record<string, unknown>;
  return (
    record.kind === "chunk" &&
    isProtocol(record.protocol) &&
    typeof record.toolCallId === "string" &&
    typeof record.delta === "string" &&
    typeof record.atMs === "number"
  );
}

export function isDoneMessage(value: unknown): value is { kind: "done" } {
  if (!value || typeof value !== "object") return false;
  return (value as { kind?: unknown }).kind === "done";
}

function isProtocol(value: unknown): value is ProtocolName {
  return value === "ag-ui" || value === "openai" || value === "anthropic";
}

function createUnit(seed: number): () => number {
  let state = seed >>> 0;
  return function nextUnit() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function buildOrderDocument(
  callIndex: number,
  noteChars: number,
  itemCount: number,
  nextUnit: () => number,
): string {
  let notes = "";
  while (notes.length < noteChars) {
    let index = Math.floor(nextUnit() * noteAlphabet.length);
    notes += noteAlphabet[index] ?? "a";
  }
  let items = [];
  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    items.push({
      sku: `sku-${String(itemIndex).padStart(4, "0")}`,
      qty: (itemIndex % 9) + 1,
    });
  }
  return JSON.stringify({
    title: `Batch ${callIndex + 1}`,
    notes,
    items,
  });
}

function sliceDocument(document: string, nextUnit: () => number): string[] {
  let slices: string[] = [];
  let cursor = 0;
  while (cursor < document.length) {
    let size =
      cursor < smallSliceLimit
        ? smallSliceFloor + Math.floor(nextUnit() * smallSliceSpan)
        : largeSliceFloor + Math.floor(nextUnit() * largeSliceSpan);
    let next = Math.min(document.length, cursor + size);
    slices.push(document.slice(cursor, next));
    cursor = next;
  }
  return slices;
}
