import { sha256HexAuto } from "./sha256.js";
import type { HashSource, PayloadObservation, VerifyManifest, VerifyResult } from "./types.js";

// Checks stay on the caller's bytes. This module does not open or write files.

export async function verifyWithJavaScript(
  payload: Uint8Array,
  manifest: VerifyManifest,
  observed: PayloadObservation = {},
  hashSource: HashSource = "node",
): Promise<VerifyResult> {
  const shape = manifestShape(manifest);
  if (shape) return shape;
  const metadata = metadataFailure(payload.byteLength, manifest, observed);
  if (metadata) return metadata;
  const actual = await sha256HexAuto(payload, hashSource);
  const expected = manifest.sha256.trim().toLowerCase();
  if (actual.toLowerCase() !== expected) {
    return { ok: false, reason: "hash-mismatch", expected, actual };
  }
  return { ok: true, sha256: actual, byteLength: payload.byteLength };
}

function manifestShape(manifest: VerifyManifest): VerifyResult | undefined {
  const digest = manifest.sha256.trim();
  if (digest.length === 0) return { ok: false, reason: "missing-digest" };
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) return { ok: false, reason: "invalid-digest" };
  const minBytes = manifest.minBytes;
  const maxBytes = manifest.maxBytes;
  const exactBytes = manifest.exactBytes;
  if (minBytes !== undefined && maxBytes !== undefined && minBytes > maxBytes) {
    return { ok: false, reason: "invalid-manifest" };
  }
  if (exactBytes !== undefined && minBytes !== undefined && exactBytes < minBytes) {
    return { ok: false, reason: "invalid-manifest" };
  }
  if (exactBytes !== undefined && maxBytes !== undefined && exactBytes > maxBytes) {
    return { ok: false, reason: "invalid-manifest" };
  }
  return undefined;
}

function metadataFailure(
  actualLength: number,
  manifest: VerifyManifest,
  observed: PayloadObservation,
): VerifyResult | undefined {
  if (manifest.exactBytes !== undefined && actualLength !== manifest.exactBytes) {
    return { ok: false, reason: "size-mismatch", actual: actualLength, expected: manifest.exactBytes };
  }
  if (manifest.minBytes !== undefined && actualLength < manifest.minBytes) {
    return { ok: false, reason: "size-below-min", actual: actualLength, min: manifest.minBytes };
  }
  if (manifest.maxBytes !== undefined && actualLength > manifest.maxBytes) {
    return { ok: false, reason: "size-above-max", actual: actualLength, max: manifest.maxBytes };
  }
  if (manifest.mime !== undefined) {
    const actualMime = observed.mime;
    if (actualMime === undefined || !mimeMatches(manifest.mime, actualMime)) {
      return { ok: false, reason: "mime-mismatch", expected: manifest.mime, actual: actualMime ?? null };
    }
  }
  if (manifest.filename !== undefined) {
    const actualFilename = observed.filename;
    if (actualFilename === undefined || actualFilename !== manifest.filename) {
      return {
        ok: false,
        reason: "filename-mismatch",
        expected: manifest.filename,
        actual: actualFilename ?? null,
      };
    }
  }
  return undefined;
}

function mimeMatches(expected: string, actual: string): boolean {
  return expected.trim().toLowerCase() === actual.trim().toLowerCase();
}
