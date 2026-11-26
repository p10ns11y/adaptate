import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type NativeStatus =
  | "available"
  | "native-binary-missing"
  | "native-load-failed"
  | "native-abi-mismatch"
  | "native-runtime-failed";

export interface NativeUnavailable {
  available: false;
  status: NativeStatus;
}

export interface NativeScanner {
  push: (chunk: Uint8Array) => string;
  finish: () => string;
}

export interface NativeAddon {
  gpuAvailable: () => boolean;
  hashLargeBuffer: (payload: Uint8Array) => Promise<string>;
  verifyPayload: (payload: Uint8Array, manifestJson: string, observedJson: string) => Promise<string>;
  verifyBatch: (payloads: Uint8Array[], manifestJson: string[], observedJson: string[]) => Promise<string>;
  NativeScanner: new () => NativeScanner;
}

export type NativeLoader = (binaryPath: string) => unknown;

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function nativeBinaryPath(): string {
  return join(packageRoot, "adaptate-accel.node");
}

export function isAvailable(binaryPath = nativeBinaryPath()): boolean {
  return existsSync(binaryPath);
}

export function loadNativeAddon(
  binaryPath = nativeBinaryPath(),
  loader: NativeLoader = defaultNativeLoader,
): { status: NativeStatus; addon: NativeAddon | null } {
  if (!existsSync(binaryPath)) return { status: "native-binary-missing", addon: null };
  try {
    const loaded = loader(binaryPath);
    if (!isNativeAddon(loaded)) return { status: "native-abi-mismatch", addon: null };
    return { status: "available", addon: loaded };
  } catch {
    return { status: "native-load-failed", addon: null };
  }
}

export function isGpuAvailable(binaryPath = nativeBinaryPath(), loader: NativeLoader = defaultNativeLoader): boolean {
  const loaded = loadNativeAddon(binaryPath, loader);
  if (!loaded.addon) return false;
  try {
    return loaded.addon.gpuAvailable() === true;
  } catch {
    return false;
  }
}

export function isNativeAddon(value: unknown): value is NativeAddon {
  if (!isRecord(value)) return false;
  if (typeof value.gpuAvailable !== "function") return false;
  if (typeof value.hashLargeBuffer !== "function") return false;
  if (typeof value.verifyPayload !== "function") return false;
  if (typeof value.verifyBatch !== "function") return false;
  if (typeof value.NativeScanner !== "function") return false;
  return true;
}

function defaultNativeLoader(binaryPath: string): unknown {
  const requireFromPackage = createRequire(import.meta.url);
  return requireFromPackage(binaryPath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
