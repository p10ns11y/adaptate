import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  clearCreatedWasmBindingsCache,
  createWasmBindings,
  type WasmLoadHooks,
  type WasmLoadResult,
} from "./bindings.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pathCache = new Map<string, Promise<WasmLoadResult>>();

export function wasmBinaryPath(): string {
  return join(packageRoot, "adaptate_accel.wasm");
}

export function isAvailable(binaryPath = wasmBinaryPath()): boolean {
  return existsSync(binaryPath);
}

export async function loadWasmModule(
  binaryPath = wasmBinaryPath(),
  hooks: Partial<WasmLoadHooks> = {},
): Promise<WasmLoadResult> {
  const custom =
    hooks.readBytes !== undefined || hooks.instantiate !== undefined || hooks.mapExports !== undefined;
  if (!custom) {
    const cached = pathCache.get(binaryPath);
    if (cached) return cached;
    const pending = loadDefault(binaryPath).then((result) => {
      if (!result.bindings) pathCache.delete(binaryPath);
      return result;
    });
    pathCache.set(binaryPath, pending);
    return pending;
  }
  const readBytes = hooks.readBytes ?? defaultReadBytes;
  const bytes = readBytes(binaryPath);
  if (bytes === null || bytes.byteLength === 0) return { status: "wasm-binary-missing", bindings: null };
  return createWasmBindings(bytes, hooks);
}

async function loadDefault(binaryPath: string): Promise<WasmLoadResult> {
  const bytes = defaultReadBytes(binaryPath);
  if (bytes === null || bytes.byteLength === 0) return { status: "wasm-binary-missing", bindings: null };
  return createWasmBindings(bytes);
}

export function clearWasmBindingsCache(): void {
  pathCache.clear();
  clearCreatedWasmBindingsCache();
}

function defaultReadBytes(binaryPath: string): Uint8Array | null {
  if (!existsSync(binaryPath)) return null;
  return new Uint8Array(readFileSync(binaryPath));
}
