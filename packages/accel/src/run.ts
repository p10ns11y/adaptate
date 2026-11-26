import { loadOptionalPackage, probeCapabilities } from "./probe.js";
import { fallbackOrder, routeByteLength, routePayload } from "./route.js";
import type {
  BackendName,
  HashSource,
  PayloadObservation,
  RouteOptions,
  VerifyBatchItem,
  VerifyManifest,
  VerifyResult,
} from "./types.js";
import { verifyWithJavaScript } from "./verify.js";

export interface VerifyRunOptions extends RouteOptions {
  hashSource?: HashSource;
  loadBackend?: (backend: BackendName) => Promise<unknown>;
}

export async function defaultLoadBackend(backend: BackendName): Promise<unknown> {
  switch (backend) {
    case "js":
      return null;
    case "wasm":
      return loadOptionalPackage("@adaptate/wasm");
    case "native":
    case "gpu":
      return loadOptionalPackage("@adaptate/native");
    default: {
      const unexpected: never = backend;
      throw new Error(String(unexpected));
    }
  }
}

export async function verifyInMemory(
  payload: Uint8Array,
  manifest: VerifyManifest,
  observed: PayloadObservation = {},
  options: VerifyRunOptions = {},
): Promise<VerifyResult> {
  const capabilities = options.capabilities ?? (await probeCapabilities());
  const selected = routePayload(payload, { ...options, capabilities, workload: "verify" });
  const item: VerifyBatchItem = { payload, manifest, observed };
  for (const backend of fallbackOrder(selected)) {
    if (backend === "js") continue;
    const loaded = await loadSafely(backend, options);
    if (backend === "gpu") {
      const accelerated = await invokeBatch(loaded, [item]);
      if (accelerated?.[0]) return accelerated[0];
      continue;
    }
    const accelerated = await invokeVerify(loaded, payload, manifest, observed);
    if (accelerated) return accelerated;
  }
  return verifyWithJavaScript(payload, manifest, observed, options.hashSource);
}

export async function verifyBatch(
  items: readonly VerifyBatchItem[],
  options: VerifyRunOptions = {},
): Promise<VerifyResult[]> {
  if (items.length === 0) return [];
  let totalBytes = 0;
  for (const item of items) totalBytes += item.payload.byteLength;
  const capabilities = options.capabilities ?? (await probeCapabilities());
  const selected = routeByteLength(totalBytes, { ...options, capabilities, workload: "verify" });
  for (const backend of fallbackOrder(selected)) {
    if (backend === "js") continue;
    const accelerated = await invokeBatch(await loadSafely(backend, options), items);
    if (accelerated) return accelerated;
  }
  const results: VerifyResult[] = [];
  for (const item of items) {
    results.push(await verifyWithJavaScript(item.payload, item.manifest, item.observed ?? {}, options.hashSource));
  }
  return results;
}

async function loadSafely(backend: BackendName, options: VerifyRunOptions): Promise<unknown> {
  const load = options.loadBackend ?? defaultLoadBackend;
  try {
    return await load(backend);
  } catch {
    return null;
  }
}

async function invokeVerify(
  loaded: unknown,
  payload: Uint8Array,
  manifest: VerifyManifest,
  observed: PayloadObservation,
): Promise<VerifyResult | null> {
  if (!isRecord(loaded) || typeof loaded.verifyPayload !== "function") return null;
  try {
    const result: unknown = await loaded.verifyPayload(payload, manifest, observed);
    return isVerifyResult(result) ? result : null;
  } catch {
    return null;
  }
}

async function invokeBatch(loaded: unknown, items: readonly VerifyBatchItem[]): Promise<VerifyResult[] | null> {
  if (!isRecord(loaded) || typeof loaded.verifyBatch !== "function") return null;
  try {
    const result: unknown = await loaded.verifyBatch(items);
    return isVerifyResultList(result) ? result : null;
  } catch {
    return null;
  }
}

function isVerifyResultList(value: unknown): value is VerifyResult[] {
  return Array.isArray(value) && value.every((item) => isVerifyResult(item));
}

function isVerifyResult(value: unknown): value is VerifyResult {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  const record = value as { ok?: unknown };
  return record.ok === true || record.ok === false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
