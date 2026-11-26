import type { Capabilities } from "./types.js";

export interface NativeAvailability {
  available: boolean;
  gpu: boolean;
}

export interface ProbeLoaders {
  loadNative: () => Promise<unknown>;
  loadWasm: () => Promise<unknown>;
}

export async function importOptional<Loaded>(load: () => Promise<Loaded>): Promise<Loaded | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

export async function loadOptionalPackage(specifier: string): Promise<unknown> {
  return importOptional(() => import(specifier));
}

export function readNativeAvailability(loaded: unknown): NativeAvailability {
  if (!isRecord(loaded) || typeof loaded.isAvailable !== "function") {
    return { available: false, gpu: false };
  }
  const available = loaded.isAvailable() === true;
  const gpuProbe = loaded.isGpuAvailable;
  const gpu = available && typeof gpuProbe === "function" && gpuProbe() === true;
  return { available, gpu };
}

export function readWasmAvailability(loaded: unknown): boolean {
  if (!isRecord(loaded) || typeof loaded.isAvailable !== "function") {
    return false;
  }
  return loaded.isAvailable() === true;
}

export async function probeCapabilities(loaders: ProbeLoaders = defaultProbeLoaders): Promise<Capabilities> {
  const nativeLoaded = await loaders.loadNative();
  const wasmLoaded = await loaders.loadWasm();
  const native = nativeLoaded === null ? { available: false, gpu: false } : readNativeAvailability(nativeLoaded);
  const wasm = wasmLoaded !== null && readWasmAvailability(wasmLoaded);
  return {
    js: true,
    native: native.available,
    wasm,
    gpu: native.available && native.gpu,
  };
}

const defaultProbeLoaders: ProbeLoaders = {
  loadNative: () => loadOptionalPackage("@adaptate/native"),
  loadWasm: () => loadOptionalPackage("@adaptate/wasm"),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
