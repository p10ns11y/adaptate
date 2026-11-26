import type { ScanSnapshot, VerifyResult } from "./parse.js";
import { parseScanText, parseVerifyText } from "./parse.js";

export type WasmStatus =
  | "available"
  | "wasm-binary-missing"
  | "wasm-load-failed"
  | "wasm-abi-mismatch"
  | "wasm-call-failed"
  | "wasm-runtime-failed";

export interface WasmUnavailable {
  available: false;
  status: WasmStatus;
}

export interface WasmBindings {
  memory: WebAssembly.Memory;
  alloc: (size: number) => number;
  dealloc: (pointer: number, size: number) => void;
  sha256: (pointer: number, length: number, output: number) => number;
  verify: (
    payloadPointer: number,
    payloadLength: number,
    manifestPointer: number,
    manifestLength: number,
    observedPointer: number,
    observedLength: number,
    outputPointer: number,
    outputCapacity: number,
  ) => number;
  scannerNew: () => number;
  scannerFree: (handle: number) => void;
  scannerPush: (
    handle: number,
    pointer: number,
    length: number,
    outputPointer: number,
    outputCapacity: number,
  ) => number;
  scannerFinish: (handle: number, outputPointer: number, outputCapacity: number) => number;
}

export interface WasmLoadHooks {
  readBytes: (binaryPath: string) => Uint8Array | null;
  instantiate: (bytes: Uint8Array) => Promise<WebAssembly.Instance>;
  mapExports: (instance: WebAssembly.Instance) => WasmBindings | null;
}

export type WasmLoadResult = { status: WasmStatus; bindings: WasmBindings | null };

const EXPORT_NAMES = [
  "adaptate_alloc",
  "adaptate_dealloc",
  "adaptate_sha256",
  "adaptate_verify",
  "adaptate_scanner_new",
  "adaptate_scanner_free",
  "adaptate_scanner_push",
  "adaptate_scanner_finish",
] as const;

/** First output buffer size; grown when the C ABI reports a larger required length. */
export const INITIAL_OUTPUT_CAPACITY = 4096;
/** Snapshots larger than this are rejected instead of allocating unbounded memory. */
export const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

const utf8Decoder = new TextDecoder("utf-8");
const createdBindings = new Map<Uint8Array, Promise<WasmLoadResult>>();

export function bindingsFromInstance(instance: WebAssembly.Instance): WasmBindings | null {
  const exports = instance.exports;
  if (!isRecord(exports) || !(exports.memory instanceof WebAssembly.Memory)) return null;
  const functions: Partial<Record<(typeof EXPORT_NAMES)[number], (...args: never[]) => unknown>> = {};
  for (const name of EXPORT_NAMES) {
    const candidate = exports[name];
    if (typeof candidate !== "function") return null;
    functions[name] = candidate as (...args: never[]) => unknown;
  }
  return {
    memory: exports.memory,
    alloc: functions.adaptate_alloc as WasmBindings["alloc"],
    dealloc: functions.adaptate_dealloc as WasmBindings["dealloc"],
    sha256: functions.adaptate_sha256 as WasmBindings["sha256"],
    verify: functions.adaptate_verify as WasmBindings["verify"],
    scannerNew: functions.adaptate_scanner_new as WasmBindings["scannerNew"],
    scannerFree: functions.adaptate_scanner_free as WasmBindings["scannerFree"],
    scannerPush: functions.adaptate_scanner_push as WasmBindings["scannerPush"],
    scannerFinish: functions.adaptate_scanner_finish as WasmBindings["scannerFinish"],
  };
}

/**
 * Instantiate C-ABI bindings from already-fetched `.wasm` bytes.
 * This path does not import `node:fs`, so a browser can prefetch the module
 * and reuse the returned bindings for honest timings.
 */
export async function createWasmBindings(
  bytes: Uint8Array,
  hooks: Pick<Partial<WasmLoadHooks>, "instantiate" | "mapExports"> = {},
): Promise<WasmLoadResult> {
  const custom = hooks.instantiate !== undefined || hooks.mapExports !== undefined;
  if (!custom) {
    const cached = createdBindings.get(bytes);
    if (cached) return cached;
  }
  const pending = instantiateBindings(bytes, hooks);
  if (!custom) {
    const cached = pending.then((result) => {
      if (!result.bindings) createdBindings.delete(bytes);
      return result;
    });
    createdBindings.set(bytes, cached);
    return cached;
  }
  return pending;
}

export function clearCreatedWasmBindingsCache(): void {
  createdBindings.clear();
}

async function instantiateBindings(
  bytes: Uint8Array,
  hooks: Pick<Partial<WasmLoadHooks>, "instantiate" | "mapExports">,
): Promise<WasmLoadResult> {
  if (bytes.byteLength === 0) return { status: "wasm-binary-missing", bindings: null };
  const instantiate = hooks.instantiate ?? defaultInstantiate;
  const mapExports = hooks.mapExports ?? bindingsFromInstance;
  let instance: WebAssembly.Instance;
  try {
    instance = await instantiate(bytes);
  } catch {
    return { status: "wasm-load-failed", bindings: null };
  }
  const bindings = mapExports(instance);
  if (bindings === null) return { status: "wasm-abi-mismatch", bindings: null };
  const probe = bindings.alloc(0);
  if (probe === 0) return { status: "wasm-call-failed", bindings: null };
  bindings.dealloc(probe, 0);
  return { status: "available", bindings };
}

export function hashWithBindings(bindings: WasmBindings, payload: Uint8Array): string | null {
  const input = payload.byteLength === 0 ? 0 : bindings.alloc(payload.byteLength);
  if (payload.byteLength !== 0 && input === 0) return null;
  const output = bindings.alloc(64);
  if (output === 0) {
    release(bindings, input, payload.byteLength);
    return null;
  }
  if (payload.byteLength !== 0) copyBytes(bindings.memory, input, payload);
  try {
    const written = bindings.sha256(input, payload.byteLength, output);
    if (written !== 64) return null;
    return readUtf8(bindings.memory, output, 64);
  } catch {
    return null;
  } finally {
    release(bindings, input, payload.byteLength);
    bindings.dealloc(output, 64);
  }
}

export function verifyWithBindings(
  bindings: WasmBindings,
  payload: Uint8Array,
  manifestJson: string,
  observedJson: string,
): VerifyResult | null {
  const payloadCopy = allocateCopy(bindings, payload);
  const manifestCopy = allocateCopy(bindings, encodeText(manifestJson));
  const observedCopy = allocateCopy(bindings, encodeText(observedJson));
  try {
    if (!payloadCopy || !manifestCopy || !observedCopy) return null;
    const text = readGrowableOutput(bindings, (output, capacity) =>
      bindings.verify(
        payloadCopy.pointer,
        payloadCopy.size,
        manifestCopy.pointer,
        manifestCopy.size,
        observedCopy.pointer,
        observedCopy.size,
        output,
        capacity,
      ),
    );
    return text === null ? null : parseVerifyText(text);
  } finally {
    releaseAllocation(bindings, payloadCopy);
    releaseAllocation(bindings, manifestCopy);
    releaseAllocation(bindings, observedCopy);
  }
}

export function openScanner(bindings: WasmBindings): number | null {
  const handle = bindings.scannerNew();
  return handle === 0 ? null : handle;
}

export function closeScanner(bindings: WasmBindings, handle: number): void {
  bindings.scannerFree(handle);
}

export function pushScanner(bindings: WasmBindings, handle: number, chunk: Uint8Array): ScanSnapshot | null {
  return callScanner(bindings, chunk, (copy, output, capacity) =>
    bindings.scannerPush(handle, copy.pointer, copy.size, output, capacity),
  );
}

export function finishScanner(bindings: WasmBindings, handle: number): ScanSnapshot | null {
  const text = readGrowableOutput(bindings, (output, capacity) =>
    bindings.scannerFinish(handle, output, capacity),
  );
  return text === null ? null : parseScanText(text);
}

interface Allocation {
  pointer: number;
  size: number;
}

function callScanner(
  bindings: WasmBindings,
  chunk: Uint8Array,
  invoke: (copy: Allocation, output: number, capacity: number) => number,
): ScanSnapshot | null {
  const copy = allocateCopy(bindings, chunk);
  try {
    if (!copy) return null;
    const text = readGrowableOutput(bindings, (output, capacity) => invoke(copy, output, capacity));
    return text === null ? null : parseScanText(text);
  } finally {
    releaseAllocation(bindings, copy);
  }
}

function readGrowableOutput(
  bindings: WasmBindings,
  invoke: (output: number, capacity: number) => number,
): string | null {
  let capacity = INITIAL_OUTPUT_CAPACITY;
  for (;;) {
    const thisCapacity = capacity;
    const output = bindings.alloc(thisCapacity);
    if (output === 0) return null;
    try {
      const written = invoke(output, thisCapacity);
      if (written < 0) return null;
      if (written <= thisCapacity) return readUtf8(bindings.memory, output, written);
      if (written > MAX_OUTPUT_BYTES) return null;
      capacity = written;
    } catch {
      return null;
    } finally {
      bindings.dealloc(output, thisCapacity);
    }
  }
}

function allocateCopy(bindings: WasmBindings, bytes: Uint8Array): Allocation | null {
  if (bytes.byteLength === 0) return { pointer: 0, size: 0 };
  const pointer = bindings.alloc(bytes.byteLength);
  if (pointer === 0) return null;
  copyBytes(bindings.memory, pointer, bytes);
  return { pointer, size: bytes.byteLength };
}

function releaseAllocation(bindings: WasmBindings, allocation: Allocation | null): void {
  if (!allocation) return;
  release(bindings, allocation.pointer, allocation.size);
}

function release(bindings: WasmBindings, pointer: number, size: number): void {
  if (pointer !== 0) bindings.dealloc(pointer, size);
}

function copyBytes(memory: WebAssembly.Memory, pointer: number, bytes: Uint8Array): void {
  new Uint8Array(memory.buffer).set(bytes, pointer);
}

function readUtf8(memory: WebAssembly.Memory, pointer: number, length: number): string {
  return utf8Decoder.decode(new Uint8Array(memory.buffer, pointer, length));
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export async function defaultInstantiate(bytes: Uint8Array): Promise<WebAssembly.Instance> {
  const compiled = (await WebAssembly.instantiate(bytes)) as unknown as { instance: WebAssembly.Instance };
  return compiled.instance;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
