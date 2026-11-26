import {
  isAvailable,
  isGpuAvailable,
  loadNativeAddon,
  nativeBinaryPath,
  type NativeLoader,
  type NativeStatus,
  type NativeUnavailable,
} from "./load.js";
import { parseScanText, parseVerifyListText, parseVerifyText, type ScanSnapshot, type VerifyResult } from "./parse.js";

export { isAvailable, isGpuAvailable, nativeBinaryPath };
export type { NativeLoader, NativeStatus, NativeUnavailable };
export type { ScanSnapshot, VerifyResult } from "./parse.js";

export interface NativeStream {
  available: true;
  push: (chunk: Uint8Array) => ScanSnapshot | NativeUnavailable;
  finish: () => ScanSnapshot | NativeUnavailable;
}

export interface NativeBatchItem {
  payload: Uint8Array;
  manifest: { sha256: string };
  observed?: { mime?: string; filename?: string };
}

export async function hashPayload(
  payload: Uint8Array,
  binaryPath = nativeBinaryPath(),
  loader?: NativeLoader,
): Promise<string | NativeUnavailable> {
  const loaded = loadNativeAddon(binaryPath, loader);
  if (!loaded.addon) return { available: false, status: loaded.status };
  try {
    const digest = await loaded.addon.hashLargeBuffer(payload);
    if (!/^[0-9a-fA-F]{64}$/.test(digest)) return { available: false, status: "native-runtime-failed" };
    return digest.toLowerCase();
  } catch {
    return { available: false, status: "native-runtime-failed" };
  }
}

export async function verifyPayload(
  payload: Uint8Array,
  manifest: NativeBatchItem["manifest"],
  observed: NativeBatchItem["observed"] = {},
  binaryPath = nativeBinaryPath(),
  loader?: NativeLoader,
): Promise<VerifyResult | NativeUnavailable> {
  const loaded = loadNativeAddon(binaryPath, loader);
  if (!loaded.addon) return { available: false, status: loaded.status };
  try {
    const encoded = await loaded.addon.verifyPayload(payload, JSON.stringify(manifest), JSON.stringify(observed));
    const result = parseVerifyText(encoded);
    if (!result) return { available: false, status: "native-runtime-failed" };
    return result;
  } catch {
    return { available: false, status: "native-runtime-failed" };
  }
}

export async function verifyBatch(
  items: readonly NativeBatchItem[],
  binaryPath = nativeBinaryPath(),
  loader?: NativeLoader,
): Promise<VerifyResult[] | NativeUnavailable> {
  const loaded = loadNativeAddon(binaryPath, loader);
  if (!loaded.addon) return { available: false, status: loaded.status };
  try {
    const payloads = items.map((item) => item.payload);
    const manifests = items.map((item) => JSON.stringify(item.manifest));
    const observed = items.map((item) => JSON.stringify(item.observed ?? {}));
    const encoded = await loaded.addon.verifyBatch(payloads, manifests, observed);
    const results = parseVerifyListText(encoded);
    if (!results) return { available: false, status: "native-runtime-failed" };
    return results;
  } catch {
    return { available: false, status: "native-runtime-failed" };
  }
}

export function createStreamParser(
  binaryPath = nativeBinaryPath(),
  loader?: NativeLoader,
): NativeStream | NativeUnavailable {
  const loaded = loadNativeAddon(binaryPath, loader);
  if (!loaded.addon) return { available: false, status: loaded.status };
  try {
    const scanner = new loaded.addon.NativeScanner();
    return {
      available: true,
      push(chunk: Uint8Array) {
        try {
          const snapshot = parseScanText(scanner.push(chunk));
          if (!snapshot) return { available: false, status: "native-runtime-failed" };
          return snapshot;
        } catch {
          return { available: false, status: "native-runtime-failed" };
        }
      },
      finish() {
        try {
          const snapshot = parseScanText(scanner.finish());
          if (!snapshot) return { available: false, status: "native-runtime-failed" };
          return snapshot;
        } catch {
          return { available: false, status: "native-runtime-failed" };
        }
      },
    };
  } catch {
    return { available: false, status: "native-runtime-failed" };
  }
}
