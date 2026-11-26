import { createHash } from "node:crypto";

import type { HashSource } from "./types.js";

const HEX_DIGITS = "0123456789abcdef";

export function bytesToHex(bytes: Uint8Array): string {
  let encoded = "";
  for (const byte of bytes) {
    encoded += HEX_DIGITS.charAt(byte >> 4);
    encoded += HEX_DIGITS.charAt(byte & 0x0f);
  }
  return encoded;
}

export function sha256Hex(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

export async function sha256HexWebCrypto(payload: Uint8Array): Promise<string> {
  const copy = new ArrayBuffer(payload.byteLength);
  new Uint8Array(copy).set(payload);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256HexAuto(
  payload: Uint8Array,
  source: HashSource = "auto",
): Promise<string> {
  const subtleMissing = globalThis.crypto?.subtle === undefined;
  if (source === "node" || (source === "auto" && subtleMissing)) {
    return sha256Hex(payload);
  }
  return sha256HexWebCrypto(payload);
}
