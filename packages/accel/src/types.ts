export const SMALL_THRESHOLD_BYTES = 32 * 1024;
export const GPU_THRESHOLD_BYTES = 4 * 1024 * 1024;
export const MAX_DEPTH = 64;

export type BackendName = "js" | "wasm" | "native" | "gpu";
export type Workload = "parse" | "verify";
export type HashSource = "auto" | "subtle" | "node";

export interface Capabilities {
  js: true;
  wasm: boolean;
  native: boolean;
  gpu: boolean;
}

export const jsCapabilities: Capabilities = {
  js: true,
  wasm: false,
  native: false,
  gpu: false,
};

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ScanStatus = "pending" | "ready" | "error";

export type ScanFailureReason =
  | "invalid-utf8"
  | "truncated-utf8"
  | "invalid-json"
  | "truncated-json";

export interface ScanSnapshot {
  status: ScanStatus;
  values: JsonValue[];
  reason?: ScanFailureReason;
}

export interface VerifyManifest {
  sha256: string;
  minBytes?: number;
  maxBytes?: number;
  exactBytes?: number;
  mime?: string;
  filename?: string;
}

export interface PayloadObservation {
  mime?: string;
  filename?: string;
}

export type VerifyResult =
  | { ok: true; sha256: string; byteLength: number }
  | { ok: false; reason: "missing-digest" }
  | { ok: false; reason: "invalid-digest" }
  | { ok: false; reason: "invalid-manifest" }
  | { ok: false; reason: "hash-mismatch"; expected: string; actual: string }
  | { ok: false; reason: "size-mismatch"; actual: number; expected: number }
  | { ok: false; reason: "size-below-min"; actual: number; min: number }
  | { ok: false; reason: "size-above-max"; actual: number; max: number }
  | { ok: false; reason: "mime-mismatch"; expected: string; actual: string | null }
  | { ok: false; reason: "filename-mismatch"; expected: string; actual: string | null };

export interface VerifyBatchItem {
  payload: Uint8Array;
  manifest: VerifyManifest;
  observed?: PayloadObservation;
}

export type RouteInput = Uint8Array | ArrayBuffer | object;

export interface RouteOptions {
  smallThresholdBytes?: number;
  gpuThresholdBytes?: number;
  capabilities?: Capabilities;
  workload?: Workload;
}
