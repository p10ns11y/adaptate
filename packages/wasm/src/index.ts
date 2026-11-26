import {
  closeScanner,
  createWasmBindings,
  finishScanner,
  hashWithBindings,
  openScanner,
  pushScanner,
  verifyWithBindings,
  type WasmBindings,
  type WasmLoadHooks,
  type WasmStatus,
  type WasmUnavailable,
} from "./bindings.js";
import { clearWasmBindingsCache, isAvailable, loadWasmModule, wasmBinaryPath } from "./node-load.js";
import type { ScanSnapshot, VerifyResult } from "./parse.js";

export { clearWasmBindingsCache, createWasmBindings, hashWithBindings, isAvailable, loadWasmModule, verifyWithBindings, wasmBinaryPath };
export type { WasmBindings, WasmLoadHooks, WasmStatus, WasmUnavailable };
export type { ScanSnapshot, VerifyResult } from "./parse.js";

export interface WasmStream {
  available: true;
  push: (chunk: Uint8Array) => ScanSnapshot | WasmUnavailable;
  finish: () => ScanSnapshot | WasmUnavailable;
  close: () => void;
}

export interface WasmBatchItem {
  payload: Uint8Array;
  manifest: { sha256: string };
  observed?: { mime?: string; filename?: string };
}

export async function hashPayload(
  payload: Uint8Array,
  hooks?: Partial<WasmLoadHooks>,
  binaryPath = wasmBinaryPath(),
): Promise<string | WasmUnavailable> {
  const loaded = await loadWasmModule(binaryPath, hooks);
  if (!loaded.bindings) return { available: false, status: loaded.status };
  const digest = hashWithBindings(loaded.bindings, payload);
  if (digest === null) return { available: false, status: "wasm-runtime-failed" };
  return digest;
}

export async function verifyPayload(
  payload: Uint8Array,
  manifest: WasmBatchItem["manifest"],
  observed: WasmBatchItem["observed"] = {},
  hooks?: Partial<WasmLoadHooks>,
  binaryPath = wasmBinaryPath(),
): Promise<VerifyResult | WasmUnavailable> {
  const loaded = await loadWasmModule(binaryPath, hooks);
  if (!loaded.bindings) return { available: false, status: loaded.status };
  const result = verifyWithBindings(loaded.bindings, payload, JSON.stringify(manifest), JSON.stringify(observed));
  if (!result) return { available: false, status: "wasm-runtime-failed" };
  return result;
}

export async function verifyBatch(
  items: readonly WasmBatchItem[],
  hooks?: Partial<WasmLoadHooks>,
  binaryPath = wasmBinaryPath(),
): Promise<VerifyResult[] | WasmUnavailable> {
  const loaded = await loadWasmModule(binaryPath, hooks);
  if (!loaded.bindings) return { available: false, status: loaded.status };
  const results: VerifyResult[] = [];
  for (const item of items) {
    const result = verifyWithBindings(
      loaded.bindings,
      item.payload,
      JSON.stringify(item.manifest),
      JSON.stringify(item.observed ?? {}),
    );
    if (!result) return { available: false, status: "wasm-runtime-failed" };
    results.push(result);
  }
  return results;
}

export async function createStreamParser(
  hooks?: Partial<WasmLoadHooks>,
  binaryPath = wasmBinaryPath(),
): Promise<WasmStream | WasmUnavailable> {
  const loaded = await loadWasmModule(binaryPath, hooks);
  if (!loaded.bindings) return { available: false, status: loaded.status };
  return openStream(loaded.bindings);
}

export function openStream(bindings: WasmBindings): WasmStream | WasmUnavailable {
  const handle = openScanner(bindings);
  if (handle === null) return { available: false, status: "wasm-call-failed" };
  return {
    available: true,
    push(chunk: Uint8Array) {
      const snapshot = pushScanner(bindings, handle, chunk);
      if (!snapshot) return { available: false, status: "wasm-runtime-failed" };
      return snapshot;
    },
    finish() {
      const snapshot = finishScanner(bindings, handle);
      if (!snapshot) return { available: false, status: "wasm-runtime-failed" };
      return snapshot;
    },
    close() {
      closeScanner(bindings, handle);
    },
  };
}
