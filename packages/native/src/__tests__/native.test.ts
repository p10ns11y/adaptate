import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createStreamParser, hashPayload, isAvailable, isGpuAvailable, nativeBinaryPath, verifyBatch, verifyPayload } from "../index.ts";
import { isAvailable as fileAvailable, isGpuAvailable as gpuFlag, isNativeAddon, loadNativeAddon, type NativeAddon } from "../load.ts";
import { parseScanText, parseVerifyListText, parseVerifyText, parseVerifyValue } from "../parse.ts";

const HASH = "ab".repeat(32);

function addon(overrides: Partial<NativeAddon> = {}): NativeAddon {
  return {
    gpuAvailable: () => false,
    hashLargeBuffer: async () => HASH,
    verifyPayload: async () => `{"ok":true,"sha256":"${HASH}","byteLength":1}`,
    verifyBatch: async () => "[]",
    NativeScanner: class {
      push(): string {
        return '{"status":"pending","values":[]}';
      }
      finish(): string {
        return '{"status":"ready","values":[]}';
      }
    },
    ...overrides,
  };
}

describe("native availability", () => {
  it("stays unavailable until a host binary can be loaded", () => {
    expect(isAvailable()).toBe(false);
    expect(isGpuAvailable()).toBe(false);
    expect(fileAvailable(join(tmpdir(), "missing-adaptate-accel.node"))).toBe(false);
    expect(nativeBinaryPath().endsWith("adaptate-accel.node")).toBe(true);
    const directory = mkdtempSync(join(tmpdir(), "adaptate-native-"));
    const binaryPath = join(directory, "adaptate-accel.node");
    const throwingPath = join(directory, "throws.cjs");
    const mismatchPath = join(directory, "mismatch.cjs");
    const successPath = join(directory, "success.cjs");
    writeFileSync(binaryPath, "");
    writeFileSync(throwingPath, "throw new Error('load failed');\n");
    writeFileSync(mismatchPath, "module.exports = {};\n");
    writeFileSync(
      successPath,
      `module.exports = {
        gpuAvailable() { return false; },
        hashLargeBuffer() { return Promise.resolve("${HASH}"); },
        verifyPayload() { return Promise.resolve('{"ok":true,"sha256":"${HASH}","byteLength":2}'); },
        verifyBatch() { return Promise.resolve('[{"ok":false,"reason":"missing-digest"}]'); },
        NativeScanner: class {
          push() { return '{"status":"pending","values":[]}'; }
          finish() { return '{"status":"ready","values":[null]}'; }
        }
      };\n`,
    );
    expect(loadNativeAddon(join(directory, "absent.node"), () => {
      throw new Error("should not load a missing file");
    })).toMatchObject({ status: "native-binary-missing" });
    expect(loadNativeAddon(throwingPath)).toMatchObject({ status: "native-load-failed" });
    expect(loadNativeAddon(mismatchPath)).toMatchObject({ status: "native-abi-mismatch" });
    expect(loadNativeAddon(binaryPath, () => {
      throw new Error("loader failed");
    })).toMatchObject({ status: "native-load-failed" });
    expect(loadNativeAddon(binaryPath, () => null)).toMatchObject({ status: "native-abi-mismatch" });
    expect(loadNativeAddon(binaryPath, () => 1)).toMatchObject({ status: "native-abi-mismatch" });
    const loaded = loadNativeAddon(successPath);
    expect(loaded.status).toBe("available");
    expect(loaded.addon?.gpuAvailable()).toBe(false);
    expect(gpuFlag(binaryPath, () => addon({ gpuAvailable: () => true }))).toBe(true);
    expect(gpuFlag(binaryPath, () => addon({ gpuAvailable: () => false }))).toBe(false);
    expect(gpuFlag(binaryPath, () => addon({
      gpuAvailable: () => {
        throw new Error("gpu probe failed");
      },
    }))).toBe(false);
    expect(gpuFlag(join(directory, "absent.node"))).toBe(false);
    const record = addon() as unknown as Record<string, unknown>;
    expect(isNativeAddon(record)).toBe(true);
    for (const key of ["gpuAvailable", "hashLargeBuffer", "verifyPayload", "verifyBatch", "NativeScanner"]) {
      const broken = { ...record };
      delete broken[key];
      expect(isNativeAddon(broken)).toBe(false);
    }
    expect(isNativeAddon(null)).toBe(false);
  });
});

describe("native calls", () => {
  it("returns typed results or typed unavailability", async () => {
    const directory = mkdtempSync(join(tmpdir(), "adaptate-native-call-"));
    const binaryPath = join(directory, "addon.cjs");
    writeFileSync(binaryPath, "");
    const payload = Uint8Array.of(1, 2);
    expect(await hashPayload(payload)).toMatchObject({ status: "native-binary-missing" });
    expect(await hashPayload(payload, binaryPath, () => addon())).toBe(HASH);
    expect(await hashPayload(payload, binaryPath, () => addon({ hashLargeBuffer: async () => HASH.toUpperCase() }))).toBe(HASH);
    expect(await hashPayload(payload, binaryPath, () => addon({ hashLargeBuffer: async () => "zz" }))).toMatchObject({
      status: "native-runtime-failed",
    });
    expect(await hashPayload(payload, binaryPath, () => addon({
      hashLargeBuffer: async () => {
        throw new Error("hash failed");
      },
    }))).toMatchObject({ status: "native-runtime-failed" });
    expect(await verifyPayload(payload, { sha256: HASH })).toMatchObject({ available: false });
    expect(await verifyPayload(payload, { sha256: HASH }, { mime: "text/plain" }, binaryPath, () => addon())).toMatchObject({
      ok: true,
    });
    expect(await verifyPayload(payload, { sha256: HASH }, {}, binaryPath, () => addon({
      verifyPayload: async () => "not-json",
    }))).toMatchObject({ status: "native-runtime-failed" });
    expect(await verifyPayload(payload, { sha256: HASH }, {}, binaryPath, () => addon({
      verifyPayload: async () => {
        throw new Error("verify failed");
      },
    }))).toMatchObject({ status: "native-runtime-failed" });
    expect(await verifyBatch([])).toMatchObject({ available: false });
    expect(await verifyBatch([
      { payload, manifest: { sha256: HASH } },
      { payload, manifest: { sha256: HASH }, observed: { filename: "note.txt" } },
    ], binaryPath, () => addon({
      verifyBatch: async () => `[{"ok":true,"sha256":"${HASH}","byteLength":2},{"ok":false,"reason":"invalid-digest"}]`,
    }))).toHaveLength(2);
    expect(await verifyBatch([{ payload, manifest: { sha256: HASH } }], binaryPath, () => addon({
      verifyBatch: async () => "not-json",
    }))).toMatchObject({ status: "native-runtime-failed" });
    expect(await verifyBatch([{ payload, manifest: { sha256: HASH } }], binaryPath, () => addon({
      verifyBatch: async () => {
        throw new Error("batch failed");
      },
    }))).toMatchObject({ status: "native-runtime-failed" });

    const parser = createStreamParser(binaryPath, () => addon());
    expect(parser.available).toBe(true);
    if (!parser.available) return;
    expect(parser.push(payload)).toMatchObject({ status: "pending" });
    expect(parser.finish()).toMatchObject({ status: "ready" });
    expect(createStreamParser()).toMatchObject({ status: "native-binary-missing" });
    const badPush = createStreamParser(binaryPath, () => addon({
      NativeScanner: class {
        push(): string {
          return "not-json";
        }
        finish(): string {
          return "not-json";
        }
      },
    }));
    if (!badPush.available) throw new Error("parser was not opened");
    expect(badPush.push(payload)).toEqual({ available: false, status: "native-runtime-failed" });
    expect(badPush.finish()).toEqual({ available: false, status: "native-runtime-failed" });
    const throwing = createStreamParser(binaryPath, () => addon({
      NativeScanner: class {
        push(): string {
          throw new Error("push failed");
        }
        finish(): string {
          throw new Error("finish failed");
        }
      },
    }));
    if (!throwing.available) throw new Error("parser was not opened");
    expect(throwing.push(payload)).toEqual({ available: false, status: "native-runtime-failed" });
    expect(throwing.finish()).toEqual({ available: false, status: "native-runtime-failed" });
    expect(createStreamParser(binaryPath, () => addon({
      NativeScanner: class {
        constructor() {
          throw new Error("construct failed");
        }
        push(): string {
          return "{}";
        }
        finish(): string {
          return "{}";
        }
      },
    }))).toEqual({ available: false, status: "native-runtime-failed" });
  });
});

describe("native result parser", () => {
  it("accepts known shapes and rejects the rest", () => {
    expect(parseScanText("{")).toBeNull();
    expect(parseScanText("1")).toBeNull();
    expect(parseScanText("null")).toBeNull();
    expect(parseScanText('{"values":[]}')).toBeNull();
    expect(parseScanText('{"status":"pending"}')).toBeNull();
    expect(parseScanText('{"status":"nope","values":[]}')).toBeNull();
    expect(parseScanText('{"status":"pending","values":{}}')).toBeNull();
    expect(parseScanText('{"status":"pending","values":[]}')).toEqual({ status: "pending", values: [] });
    expect(parseScanText('{"status":"ready","values":[1]}')).toEqual({ status: "ready", values: [1] });
    expect(parseScanText('{"status":"error","values":[]}')).toBeNull();
    expect(parseScanText('{"status":"error","values":[],"reason":1}')).toBeNull();
    expect(parseScanText('{"status":"error","values":[],"reason":"nope"}')).toBeNull();
    for (const reason of ["invalid-utf8", "truncated-utf8", "invalid-json", "truncated-json"]) {
      expect(parseScanText(`{"status":"error","values":[],"reason":"${reason}"}`)).toMatchObject({ reason });
    }
    expect(parseVerifyText("{")).toBeNull();
    expect(parseVerifyText("null")).toBeNull();
    expect(parseVerifyListText("{")).toBeNull();
    expect(parseVerifyListText("{}")).toBeNull();
    expect(parseVerifyListText("[]")).toEqual([]);
    expect(parseVerifyListText("[1]")).toBeNull();
    expect(parseVerifyListText('[{"ok":true,"sha256":"ab","byteLength":1},{"ok":false,"reason":"missing-digest"}]')).toHaveLength(2);
    expect(parseVerifyValue(1)).toBeNull();
    expect(parseVerifyValue(null)).toBeNull();
    expect(parseVerifyValue({ ok: true, sha256: 1, byteLength: 1 })).toBeNull();
    expect(parseVerifyValue({ ok: true, sha256: "ab", byteLength: "1" })).toBeNull();
    expect(parseVerifyValue({ ok: true, sha256: "ab", byteLength: 1 })).toEqual({ ok: true, sha256: "ab", byteLength: 1 });
    expect(parseVerifyValue({ ok: "yes" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "missing-digest" })).toEqual({ ok: false, reason: "missing-digest" });
    expect(parseVerifyValue({ ok: false, reason: "invalid-digest" })).toEqual({ ok: false, reason: "invalid-digest" });
    expect(parseVerifyValue({ ok: false, reason: "invalid-manifest" })).toEqual({ ok: false, reason: "invalid-manifest" });
    expect(parseVerifyValue({ ok: false, reason: "hash-mismatch", expected: 1, actual: "a" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "hash-mismatch", expected: "a", actual: 1 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "hash-mismatch", expected: "a", actual: "b" })).toMatchObject({
      reason: "hash-mismatch",
    });
    expect(parseVerifyValue({ ok: false, reason: "size-mismatch", actual: "1", expected: 2 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-mismatch", actual: 1, expected: "2" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-mismatch", actual: 1, expected: 2 })).toMatchObject({ reason: "size-mismatch" });
    expect(parseVerifyValue({ ok: false, reason: "size-below-min", actual: "1", min: 2 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-below-min", actual: 1, min: "2" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-below-min", actual: 1, min: 2 })).toMatchObject({ reason: "size-below-min" });
    expect(parseVerifyValue({ ok: false, reason: "size-above-max", actual: "1", max: 2 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-above-max", actual: 1, max: "2" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-above-max", actual: 1, max: 2 })).toMatchObject({ reason: "size-above-max" });
    expect(parseVerifyValue({ ok: false, reason: "mime-mismatch", expected: 1, actual: "a" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "mime-mismatch", expected: "a", actual: 1 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "mime-mismatch", expected: "a", actual: null })).toMatchObject({ actual: null });
    expect(parseVerifyValue({ ok: false, reason: "mime-mismatch", expected: "a", actual: "b" })).toMatchObject({ actual: "b" });
    expect(parseVerifyValue({ ok: false, reason: "filename-mismatch", expected: 1, actual: null })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "filename-mismatch", expected: "a", actual: 1 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "filename-mismatch", expected: "a", actual: null })).toMatchObject({
      reason: "filename-mismatch",
    });
    expect(parseVerifyValue({ ok: false, reason: "filename-mismatch", expected: "a", actual: "b" })).toMatchObject({ actual: "b" });
    expect(parseVerifyValue({ ok: false, reason: "other" })).toBeNull();
    expect(parseVerifyValue({ ok: false })).toBeNull();
  });
});
