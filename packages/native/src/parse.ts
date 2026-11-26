export interface ScanSnapshot {
  status: "pending" | "ready" | "error";
  values: unknown[];
  reason?: ScanFailureReason;
}

export type ScanFailureReason = "invalid-utf8" | "truncated-utf8" | "invalid-json" | "truncated-json";

export type VerifyResult =
  | { ok: true; sha256: string; byteLength: number }
  | { ok: false; reason: "missing-digest" | "invalid-digest" | "invalid-manifest" }
  | { ok: false; reason: "hash-mismatch"; expected: string; actual: string }
  | { ok: false; reason: "size-mismatch"; actual: number; expected: number }
  | { ok: false; reason: "size-below-min"; actual: number; min: number }
  | { ok: false; reason: "size-above-max"; actual: number; max: number }
  | { ok: false; reason: "mime-mismatch"; expected: string; actual: string | null }
  | { ok: false; reason: "filename-mismatch"; expected: string; actual: string | null };

const SCAN_REASONS = new Set<ScanFailureReason>([
  "invalid-utf8",
  "truncated-utf8",
  "invalid-json",
  "truncated-json",
]);

export function parseScanText(text: string): ScanSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("status" in parsed) || !("values" in parsed)) {
    return null;
  }
  const record = parsed as { status?: unknown; values?: unknown; reason?: unknown };
  if (record.status !== "pending" && record.status !== "ready" && record.status !== "error") return null;
  if (!Array.isArray(record.values)) return null;
  if (record.status === "error") {
    if (!isScanReason(record.reason)) return null;
    return { status: "error", values: record.values, reason: record.reason };
  }
  return { status: record.status, values: record.values };
}

export function parseVerifyText(text: string): VerifyResult | null {
  try {
    return parseVerifyValue(JSON.parse(text));
  } catch {
    return null;
  }
}

export function parseVerifyListText(text: string): VerifyResult[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const results: VerifyResult[] = [];
  for (const item of parsed) {
    const result = parseVerifyValue(item);
    if (!result) return null;
    results.push(result);
  }
  return results;
}

export function parseVerifyValue(value: unknown): VerifyResult | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.ok === true) {
    if (typeof record.sha256 !== "string" || typeof record.byteLength !== "number") return null;
    return { ok: true, sha256: record.sha256, byteLength: record.byteLength };
  }
  if (record.ok !== false) return null;
  switch (record.reason) {
    case "missing-digest":
    case "invalid-digest":
    case "invalid-manifest":
      return { ok: false, reason: record.reason };
    case "hash-mismatch":
      if (typeof record.expected !== "string" || typeof record.actual !== "string") return null;
      return { ok: false, reason: "hash-mismatch", expected: record.expected, actual: record.actual };
    case "size-mismatch":
      if (typeof record.actual !== "number" || typeof record.expected !== "number") return null;
      return { ok: false, reason: "size-mismatch", actual: record.actual, expected: record.expected };
    case "size-below-min":
      if (typeof record.actual !== "number" || typeof record.min !== "number") return null;
      return { ok: false, reason: "size-below-min", actual: record.actual, min: record.min };
    case "size-above-max":
      if (typeof record.actual !== "number" || typeof record.max !== "number") return null;
      return { ok: false, reason: "size-above-max", actual: record.actual, max: record.max };
    case "mime-mismatch":
    case "filename-mismatch": {
      if (typeof record.expected !== "string") return null;
      if (record.actual !== null && typeof record.actual !== "string") return null;
      const actual = record.actual === null ? null : record.actual;
      if (record.reason === "mime-mismatch") {
        return { ok: false, reason: "mime-mismatch", expected: record.expected, actual };
      }
      return { ok: false, reason: "filename-mismatch", expected: record.expected, actual };
    }
    default:
      return null;
  }
}

function isScanReason(value: unknown): value is ScanFailureReason {
  return typeof value === "string" && SCAN_REASONS.has(value as ScanFailureReason);
}
