import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  GPU_THRESHOLD_BYTES,
  MAX_DEPTH,
  SMALL_THRESHOLD_BYTES,
  byteLengthOf,
  bytesToHex,
  createStreamParser,
  decodeUtf8Chunk,
  defaultLoadBackend,
  encodeUtf8,
  fallbackOrder,
  importOptional,
  loadOptionalPackage,
  probeCapabilities,
  readNativeAvailability,
  readWasmAvailability,
  routeByteLength,
  routePayload,
  sha256Hex,
  sha256HexAuto,
  sha256HexWebCrypto,
  verifyBatch,
  verifyInMemory,
  verifyWithJavaScript,
  type BackendName,
  type Capabilities,
  type JsonValue,
} from "../index.ts";

const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ABC_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const nativeCaps: Capabilities = { js: true, native: true, wasm: false, gpu: false };
const wasmCaps: Capabilities = { js: true, native: false, wasm: true, gpu: false };
const bothCaps: Capabilities = { js: true, native: true, wasm: true, gpu: false };
const gpuCaps: Capabilities = { js: true, native: true, wasm: true, gpu: true };
const gpuOnlyCaps: Capabilities = { js: true, native: false, wasm: false, gpu: true };

function digestOf(payload: Uint8Array): string {
  return createHash("sha256").update(payload).digest("hex");
}

function textBytes(text: string): Uint8Array {
  const encoded = encodeUtf8(text);
  if (encoded === null) throw new Error("synthetic text was not valid unicode");
  return encoded;
}

describe("sha256 reference", () => {
  it("matches the known empty and abc digests", async () => {
    const empty = new Uint8Array();
    const abc = textBytes("abc");
    expect(sha256Hex(empty)).toBe(EMPTY_HASH);
    expect(sha256Hex(abc)).toBe(ABC_HASH);
    expect(bytesToHex(Uint8Array.of(0xab, 0x0f))).toBe("ab0f");
    expect(bytesToHex(new Uint8Array())).toBe("");
    expect(await sha256HexWebCrypto(abc)).toBe(ABC_HASH);
    expect(await sha256HexAuto(abc, "node")).toBe(ABC_HASH);
    expect(await sha256HexAuto(abc, "subtle")).toBe(ABC_HASH);
    expect(await sha256HexAuto(abc, "auto")).toBe(ABC_HASH);
  });

  it("uses node when Web Crypto is absent", async () => {
    const saved = globalThis.crypto;
    const abc = textBytes("abc");
    try {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
      expect(await sha256HexAuto(abc, "auto")).toBe(ABC_HASH);
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
      expect(await sha256HexAuto(abc, "auto")).toBe(ABC_HASH);
    } finally {
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: saved });
    }
  });
});

describe("utf-8 chunk boundaries", () => {
  it("rejects lone surrogates and accepts every code-point width", () => {
    expect(encodeUtf8("\uD800")).toBeNull();
    expect(encodeUtf8("\uDC00")).toBeNull();
    const encoded = encodeUtf8("aé€😀");
    expect(encoded).toEqual(textBytes("aé€😀"));
  });

  it("carries split sequences and rejects illegal bytes", () => {
    const euro = Uint8Array.of(0xe2, 0x82, 0xac);
    for (let split = 0; split <= euro.length; split += 1) {
      const first = decodeUtf8Chunk(new Uint8Array(), euro.slice(0, split));
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const second = decodeUtf8Chunk(first.carry, euro.slice(split));
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(first.text + second.text).toBe("€");
      expect(second.carry).toEqual(new Uint8Array());
    }
    const samples = [
      Uint8Array.of(0xff),
      Uint8Array.of(0x80),
      Uint8Array.of(0xc1, 0x80),
      Uint8Array.of(0xc0, 0x80),
      Uint8Array.of(0xe0, 0x80, 0x80),
      Uint8Array.of(0xed, 0xa0, 0x80),
      Uint8Array.of(0xf0, 0x80, 0x80, 0x80),
      Uint8Array.of(0xf4, 0x90, 0x80, 0x80),
      Uint8Array.of(0xf5, 0x80, 0x80, 0x80),
      Uint8Array.of(0xe2, 0x82, 0x00),
      Uint8Array.of(0xe2, 0x20),
      Uint8Array.of(0xf0, 0x9f, 0x00),
    ];
    for (const sample of samples) {
      expect(decodeUtf8Chunk(new Uint8Array(), sample).ok).toBe(false);
    }
    const validTails = [
      Uint8Array.of(0xe2),
      Uint8Array.of(0xf0, 0x9f, 0x98),
      Uint8Array.of(0xe0, 0xa0, 0x80),
      Uint8Array.of(0xed, 0x9f, 0xbf),
      Uint8Array.of(0xf4, 0x8f, 0xbf, 0xbf),
      Uint8Array.of(0xc3, 0xa9),
    ];
    for (const sample of validTails) {
      const decoded = decodeUtf8Chunk(new Uint8Array(), sample);
      expect(decoded.ok).toBe(true);
    }
  });
});

describe("streaming parser", () => {
  const document = '{"title":"café €😀","n":1.5,"ok":true,"tags":["a",null]}';

  it("matches one-shot parsing across every byte split", () => {
    const bytes = textBytes(document);
    const expected = JSON.parse(document) as JsonValue;
    for (let split = 0; split <= bytes.length; split += 1) {
      const parser = createStreamParser();
      parser.push(bytes.slice(0, split));
      parser.push(bytes.slice(split));
      expect(parser.finish()).toEqual({ status: "ready", values: [expected] });
    }
  });

  it("accepts one-byte chunks and keeps a closed value", () => {
    const parser = createStreamParser();
    const bytes = textBytes(document);
    let snapshot = parser.push(new Uint8Array());
    for (const byte of bytes) {
      snapshot = parser.push(Uint8Array.of(byte));
    }
    expect(snapshot.status === "ready" || snapshot.status === "pending").toBe(true);
    expect(parser.finish().values).toEqual([JSON.parse(document)]);
  });

  it("reports pending, truncated, invalid, and sticky failures", () => {
    const partial = createStreamParser();
    expect(partial.push('{"title":"Pas')).toMatchObject({ status: "pending" });
    expect(partial.finish()).toMatchObject({ status: "error", reason: "truncated-json" });
    expect(partial.push("}")).toMatchObject({ status: "error", reason: "truncated-json" });

    const blank = createStreamParser();
    expect(blank.finish()).toMatchObject({ status: "error", reason: "truncated-json" });
    expect(finishOf("")).toMatchObject({ reason: "truncated-json" });

    const badByte = createStreamParser();
    expect(badByte.push(Uint8Array.of(0xff))).toMatchObject({ status: "error", reason: "invalid-utf8" });
    expect(badByte.push("1")).toMatchObject({ reason: "invalid-utf8" });

    const splitLead = createStreamParser();
    expect(splitLead.push(Uint8Array.of(0xf0, 0x9f))).toMatchObject({ status: "pending" });
    expect(splitLead.finish()).toMatchObject({ status: "error", reason: "truncated-utf8" });

    expect(createStreamParser().push("\uD800")).toMatchObject({ reason: "invalid-utf8" });
  });

  it("parses literals, numbers, strings, containers, and depth limits", () => {
    expect(createStreamParser().push("1 ").status).toBe("ready");
    expect(finishOf("true")).toEqual({ status: "ready", values: [true] });
    expect(finishOf("false")).toEqual({ status: "ready", values: [false] });
    expect(finishOf("null")).toEqual({ status: "ready", values: [null] });
    expect(finishOf(" \n\r\t1")).toEqual({ status: "ready", values: [1] });
    expect(finishOf("1 2")).toEqual({ status: "ready", values: [1, 2] });
    expect(finishOf("true:")).toMatchObject({ status: "error", reason: "invalid-json" });
    expect(pushOf("tru")).toMatchObject({ status: "pending" });
    expect(finishOf("tru")).toMatchObject({ reason: "truncated-json" });
    expect(finishOf("trueX")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("truth")).toMatchObject({ reason: "invalid-json" });
    expect(pushOf("nul")).toMatchObject({ status: "pending" });
    expect(finishOf("nulp")).toMatchObject({ reason: "invalid-json" });

    expect(pushOf("0")).toMatchObject({ status: "pending" });
    expect(finishOf("0")).toEqual({ status: "ready", values: [0] });
    expect(finishOf("-0")).toEqual({ status: "ready", values: [-0] });
    expect(finishOf("01")).toMatchObject({ reason: "invalid-json" });
    expect(pushOf("-")).toMatchObject({ status: "pending" });
    expect(finishOf("-")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("-a")).toMatchObject({ reason: "invalid-json" });
    expect(pushOf("1.")).toMatchObject({ status: "pending" });
    expect(finishOf("1.")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("1.x")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("1.50")).toEqual({ status: "ready", values: [1.5] });
    expect(pushOf("1e")).toMatchObject({ status: "pending" });
    expect(finishOf("1e")).toMatchObject({ reason: "invalid-json" });
    expect(pushOf("1e+")).toMatchObject({ status: "pending" });
    expect(finishOf("1e+")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("1eX")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("1e+X")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("1e2")).toEqual({ status: "ready", values: [100] });
    expect(finishOf("1E2")).toEqual({ status: "ready", values: [100] });
    expect(finishOf("1e+2")).toEqual({ status: "ready", values: [100] });
    expect(finishOf("1e-2")).toEqual({ status: "ready", values: [0.01] });
    expect(finishOf("1.5e2")).toEqual({ status: "ready", values: [150] });
    expect(finishOf("1e309")).toMatchObject({ reason: "invalid-json" });
    expect(pushOf("12")).toMatchObject({ status: "pending" });

    const escaped = [
      '{"s":"',
      '\\"',
      "\\\\",
      "\\/",
      "\\b",
      "\\f",
      "\\n",
      "\\r",
      "\\t",
      "\\u00e9",
      "\\u00E9",
      "\\uD800\\uDC00",
      '😀"}',
    ].join("");
    const parsed = finishOf(escaped);
    expect(parsed.status).toBe("ready");
    expect(parsed.values[0]).toMatchObject({ s: "\"\\/\b\f\n\r\téé\u{10000}😀" });
    expect(finishOf('{"s":"\\q"}')).toMatchObject({ reason: "invalid-json" });
    expect(finishOf('{"s":"\n"}')).toMatchObject({ reason: "invalid-json" });
    expect(pushOf('{"s":"\\u00')).toMatchObject({ status: "pending" });
    expect(finishOf('{"s":"\\u00')).toMatchObject({ reason: "truncated-json" });
    expect(finishOf('{"s":"\\u00G"}')).toMatchObject({ reason: "invalid-json" });
    expect(finishOf('{"s":"\\uDC00"}')).toMatchObject({ reason: "invalid-json" });
    expect(finishOf('{"s":"\\uD800"}')).toMatchObject({ reason: "invalid-json" });
    expect(pushOf('{"s":"\\uD800')).toMatchObject({ status: "pending" });
    expect(pushOf('{"s":"\\')).toMatchObject({ status: "pending" });
    expect(finishOf('{"s":"\\u0G')).toMatchObject({ reason: "invalid-json" });
    expect(pushOf('{"s":"\\uD800\\')).toMatchObject({ status: "pending" });
    expect(finishOf('{"s":"\\uD800\\x"}')).toMatchObject({ reason: "invalid-json" });
    expect(finishOf('{"s":"\\uD800\\uD800"}')).toMatchObject({ reason: "invalid-json" });
    expect(pushOf('{"s":"\\uD800\\uDE')).toMatchObject({ status: "pending" });

    expect(finishOf("[]")).toEqual({ status: "ready", values: [[]] });
    expect(finishOf("[1,2]")).toEqual({ status: "ready", values: [[1, 2]] });
    expect(finishOf("[ 1 , 2 ]")).toEqual({ status: "ready", values: [[1, 2]] });
    expect(finishOf("[1,]")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("[,]")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("[1}")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("[x")).toMatchObject({ reason: "invalid-json" });
    expect(pushOf("[")).toMatchObject({ status: "pending" });
    expect(pushOf("[1")).toMatchObject({ status: "pending" });
    expect(pushOf("[1,")).toMatchObject({ status: "pending" });
    expect(finishOf("[1")).toMatchObject({ reason: "truncated-json" });

    expect(finishOf("{}")).toEqual({ status: "ready", values: [{}] });
    expect(finishOf('{"a":1,"b":2}')).toEqual({ status: "ready", values: [{ a: 1, b: 2 }] });
    expect(finishOf('{"a":1,"a":2}')).toEqual({ status: "ready", values: [{ a: 2 }] });
    expect(finishOf("{]")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("{1}")).toMatchObject({ reason: "invalid-json" });
    expect(finishOf('{"a" 1}')).toMatchObject({ reason: "invalid-json" });
    expect(finishOf('{"a":}')).toMatchObject({ reason: "invalid-json" });
    expect(finishOf('{"a":1]')).toMatchObject({ reason: "invalid-json" });
    expect(finishOf('{"a":1,}')).toMatchObject({ reason: "invalid-json" });
    expect(finishOf("{,}")).toMatchObject({ reason: "invalid-json" });
    expect(pushOf('{"a"')).toMatchObject({ status: "pending" });
    expect(pushOf('{"a":')).toMatchObject({ status: "pending" });
    expect(finishOf('{"a":[1,{"b":true}]}')).toEqual({
      status: "ready",
      values: [{ a: [1, { b: true }] }],
    });

    let deep = "1";
    for (let count = 0; count < MAX_DEPTH; count += 1) deep = `[${deep}]`;
    expect(finishOf(deep).status).toBe("ready");
    expect(finishOf(`[${deep}]`)).toMatchObject({ reason: "invalid-json" });
    let deepObject = "1";
    for (let count = 0; count < MAX_DEPTH; count += 1) deepObject = `{"a":${deepObject}}`;
    expect(finishOf(deepObject).status).toBe("ready");
    expect(finishOf(`{"a":${deepObject}}`)).toMatchObject({ reason: "invalid-json" });
  });
});

function pushOf(text: string) {
  return createStreamParser().push(text);
}

function finishOf(text: string) {
  const parser = createStreamParser();
  parser.push(text);
  return parser.finish();
}

describe("in-memory manifest checks", () => {
  it("fails closed for hash, size, mime, filename, and manifest shape", async () => {
    const payload = textBytes("synthetic-payload");
    const hash = digestOf(payload);
    const manifest = {
      sha256: hash.toUpperCase(),
      exactBytes: payload.byteLength,
      minBytes: payload.byteLength,
      maxBytes: payload.byteLength,
      mime: "Text/Plain",
      filename: "note.txt",
    };
    expect(await verifyWithJavaScript(payload, manifest, { mime: "text/plain", filename: "note.txt" })).toEqual({
      ok: true,
      sha256: hash,
      byteLength: payload.byteLength,
    });
    const tampered = Uint8Array.from(payload);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    const tamperedHash = digestOf(tampered);
    expect(await verifyWithJavaScript(tampered, { sha256: hash })).toEqual({
      ok: false,
      reason: "hash-mismatch",
      expected: hash,
      actual: tamperedHash,
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash, exactBytes: 1 })).toMatchObject({ reason: "size-mismatch" });
    expect(await verifyWithJavaScript(payload, { sha256: hash, minBytes: payload.byteLength + 1 })).toMatchObject({
      reason: "size-below-min",
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash, maxBytes: payload.byteLength - 1 })).toMatchObject({
      reason: "size-above-max",
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash, minBytes: 0, maxBytes: 99 })).toMatchObject({ ok: true });
    expect(await verifyWithJavaScript(payload, { sha256: "   " })).toEqual({ ok: false, reason: "missing-digest" });
    expect(await verifyWithJavaScript(payload, { sha256: "abc" })).toEqual({ ok: false, reason: "invalid-digest" });
    expect(await verifyWithJavaScript(payload, { sha256: hash, minBytes: 4, maxBytes: 1 })).toEqual({
      ok: false,
      reason: "invalid-manifest",
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash, minBytes: 4, exactBytes: 1 })).toEqual({
      ok: false,
      reason: "invalid-manifest",
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash, maxBytes: 2, exactBytes: 4 })).toEqual({
      ok: false,
      reason: "invalid-manifest",
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash, mime: "text/plain" })).toEqual({
      ok: false,
      reason: "mime-mismatch",
      expected: "text/plain",
      actual: null,
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash, mime: "text/plain" }, { mime: "image/png" })).toMatchObject({
      reason: "mime-mismatch",
      actual: "image/png",
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash, filename: "note.txt" })).toEqual({
      ok: false,
      reason: "filename-mismatch",
      expected: "note.txt",
      actual: null,
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash, filename: "note.txt" }, { filename: "Note.txt" })).toMatchObject({
      reason: "filename-mismatch",
      actual: "Note.txt",
    });
    expect(await verifyWithJavaScript(payload, { sha256: hash }, {}, "subtle")).toMatchObject({ ok: true });
    expect(await verifyWithJavaScript(payload, { sha256: hash }, {}, "auto")).toMatchObject({ ok: true });
  });
});

describe("capability probe and routing", () => {
  it("probes backends without throwing when they are absent", async () => {
    expect(await importOptional(async () => "loaded")).toBe("loaded");
    expect(await importOptional(async () => {
      throw new Error("absent");
    })).toBeNull();
    expect(await loadOptionalPackage("node:fs")).toMatchObject({ existsSync: expect.any(Function) });
    expect(await loadOptionalPackage("./missing-accel-module-7290.ts")).toBeNull();
    const probed = await probeCapabilities();
    expect(probed.js).toBe(true);
    expect(probed.gpu && probed.native).toBe(probed.gpu);
    expect(readNativeAvailability(null)).toEqual({ available: false, gpu: false });
    expect(readNativeAvailability({})).toEqual({ available: false, gpu: false });
    expect(readNativeAvailability({ isAvailable: () => false, isGpuAvailable: () => true })).toEqual({
      available: false,
      gpu: false,
    });
    expect(readNativeAvailability({ isAvailable: () => 1 })).toEqual({ available: false, gpu: false });
    expect(readNativeAvailability({ isAvailable: () => true })).toEqual({ available: true, gpu: false });
    expect(readNativeAvailability({ isAvailable: () => true, isGpuAvailable: () => false })).toEqual({
      available: true,
      gpu: false,
    });
    expect(readNativeAvailability({ isAvailable: () => true, isGpuAvailable: () => true })).toEqual({
      available: true,
      gpu: true,
    });
    expect(readWasmAvailability(null)).toBe(false);
    expect(readWasmAvailability({})).toBe(false);
    expect(readWasmAvailability({ isAvailable: () => false })).toBe(false);
    expect(readWasmAvailability({ isAvailable: () => 1 })).toBe(false);
    expect(readWasmAvailability({ isAvailable: () => true })).toBe(true);
    const injected = await probeCapabilities({
      loadNative: async () => ({ isAvailable: () => true, isGpuAvailable: () => true }),
      loadWasm: async () => ({ isAvailable: () => true }),
    });
    expect(injected).toEqual({ js: true, native: true, wasm: true, gpu: true });
    const missing = await probeCapabilities({
      loadNative: async () => null,
      loadWasm: async () => null,
    });
    expect(missing).toEqual({ js: true, native: false, wasm: false, gpu: false });
    const odd = await probeCapabilities({
      loadNative: async () => ({ isAvailable: () => true, isGpuAvailable: () => false }),
      loadWasm: async () => ({ nope: true }),
    });
    expect(odd).toEqual({ js: true, native: true, wasm: false, gpu: false });
  });

  it("routes by size, object shape, and backend order", () => {
    expect(byteLengthOf({ title: "Pas" })).toBeNull();
    expect(byteLengthOf(new Uint8Array(4))).toBe(4);
    expect(byteLengthOf(new ArrayBuffer(8))).toBe(8);
    expect(routePayload({ title: "Pas" }, { capabilities: gpuCaps, smallThresholdBytes: 1 })).toBe("js");
    expect(routeByteLength(null)).toBe("js");
    expect(routeByteLength(SMALL_THRESHOLD_BYTES - 1, { capabilities: gpuCaps })).toBe("js");
    expect(routeByteLength(0, { capabilities: nativeCaps })).toBe("js");
    expect(routePayload(new Uint8Array(SMALL_THRESHOLD_BYTES), { capabilities: nativeCaps })).toBe("native");
    expect(routePayload(new Uint8Array(SMALL_THRESHOLD_BYTES), { capabilities: wasmCaps })).toBe("wasm");
    expect(routePayload(new Uint8Array(SMALL_THRESHOLD_BYTES), { capabilities: bothCaps })).toBe("native");
    expect(routePayload(new ArrayBuffer(SMALL_THRESHOLD_BYTES), { capabilities: wasmCaps })).toBe("wasm");
    expect(routeByteLength(GPU_THRESHOLD_BYTES - 1, { capabilities: gpuCaps, workload: "verify" })).toBe("native");
    expect(routeByteLength(GPU_THRESHOLD_BYTES, { capabilities: gpuCaps, workload: "verify" })).toBe("gpu");
    expect(routeByteLength(GPU_THRESHOLD_BYTES, { capabilities: gpuCaps })).toBe("native");
    expect(routeByteLength(GPU_THRESHOLD_BYTES, { capabilities: gpuOnlyCaps, workload: "verify" })).toBe("gpu");
    expect(routeByteLength(SMALL_THRESHOLD_BYTES, { capabilities: gpuOnlyCaps, workload: "verify" })).toBe("js");
    expect(routeByteLength(8, { capabilities: nativeCaps, smallThresholdBytes: 4, gpuThresholdBytes: 8, workload: "verify" })).toBe("native");
    expect(routeByteLength(8, { capabilities: gpuCaps, smallThresholdBytes: 4, gpuThresholdBytes: 8, workload: "verify" })).toBe("gpu");
    expect(routeByteLength(3, { capabilities: nativeCaps, smallThresholdBytes: 4 })).toBe("js");
    expect(fallbackOrder("gpu")).toEqual(["gpu", "native", "wasm", "js"]);
    expect(fallbackOrder("native")).toEqual(["native", "wasm", "js"]);
    expect(fallbackOrder("wasm")).toEqual(["wasm", "js"]);
    expect(fallbackOrder("js")).toEqual(["js"]);
    expect(() => fallbackOrder("other" as BackendName)).toThrow(/other/);
  });

  it("falls through native, wasm, and the JavaScript reference", async () => {
    const payload = textBytes("synthetic-payload");
    const hash = digestOf(payload);
    const calls: BackendName[] = [];
    const missed = await verifyInMemory(payload, { sha256: hash }, undefined, {
      capabilities: gpuCaps,
      smallThresholdBytes: 1,
      loadBackend: async (backend) => {
        calls.push(backend);
        return null;
      },
    });
    expect(calls).toEqual(["native", "wasm"]);
    expect(missed).toMatchObject({ ok: true, sha256: hash });

    const gpuCalls: BackendName[] = [];
    const accelerated = await verifyInMemory(new Uint8Array(GPU_THRESHOLD_BYTES), { sha256: "ab" }, {}, {
      capabilities: gpuCaps,
      loadBackend: async (backend) => {
        gpuCalls.push(backend);
        return {
          verifyBatch: async (items: Array<{ payload: Uint8Array }>) => [
            { ok: true, sha256: "accelerated", byteLength: items[0]?.payload.byteLength ?? 0 },
          ],
          verifyPayload: async () => ({ ok: true, sha256: "cpu-path", byteLength: 1 }),
        };
      },
    });
    expect(gpuCalls).toEqual(["gpu"]);
    expect(accelerated).toEqual({ ok: true, sha256: "accelerated", byteLength: GPU_THRESHOLD_BYTES });

    const gpuFallbackCalls: BackendName[] = [];
    const gpuThenNative = await verifyInMemory(new Uint8Array(GPU_THRESHOLD_BYTES), { sha256: "ab" }, {}, {
      capabilities: gpuCaps,
      loadBackend: async (backend) => {
        gpuFallbackCalls.push(backend);
        if (backend === "gpu") return { verifyPayload: async () => ({ ok: true, sha256: "should-not-use", byteLength: 1 }) };
        return { verifyPayload: async () => ({ ok: true, sha256: "from-native", byteLength: GPU_THRESHOLD_BYTES }) };
      },
    });
    expect(gpuFallbackCalls).toEqual(["gpu", "native"]);
    expect(gpuThenNative).toEqual({ ok: true, sha256: "from-native", byteLength: GPU_THRESHOLD_BYTES });

    const order: BackendName[] = [];
    const second = await verifyInMemory(new Uint8Array(SMALL_THRESHOLD_BYTES), { sha256: hash }, { filename: "a" }, {
      capabilities: nativeCaps,
      loadBackend: async (backend) => {
        order.push(backend);
        if (backend === "native") return { verifyPayload: async () => null };
        return { verifyPayload: async () => ({ ok: false, reason: "hash-mismatch" }) };
      },
    });
    expect(order).toEqual(["native", "wasm"]);
    expect(second).toEqual({ ok: false, reason: "hash-mismatch" });

    const below = await verifyInMemory(new Uint8Array(SMALL_THRESHOLD_BYTES - 1), { sha256: digestOf(new Uint8Array(SMALL_THRESHOLD_BYTES - 1)) }, {}, {
      capabilities: nativeCaps,
      loadBackend: async () => {
        throw new Error("small inputs stay in JavaScript");
      },
    });
    expect(below.ok).toBe(true);

    const thrown = await verifyInMemory(new Uint8Array(SMALL_THRESHOLD_BYTES), { sha256: digestOf(new Uint8Array(SMALL_THRESHOLD_BYTES)) }, {}, {
      capabilities: wasmCaps,
      loadBackend: async () => {
        throw new Error("optional backend failed");
      },
    });
    expect(thrown.ok).toBe(true);

    const oddResults: unknown[] = [1, null, {}, { ok: "yes" }, { ok: true }];
    for (const oddResult of oddResults) {
      const result = await verifyInMemory(new Uint8Array(SMALL_THRESHOLD_BYTES), { sha256: "zz" }, {}, {
        capabilities: nativeCaps,
        loadBackend: async () => ({ verifyPayload: async () => oddResult }),
      });
      if (oddResult && typeof oddResult === "object" && "ok" in oddResult && (oddResult as { ok?: unknown }).ok === true) {
        expect(result).toEqual({ ok: true });
      } else {
        expect(result.ok).toBe(false);
      }
    }
    const blewUp = await verifyInMemory(new Uint8Array(SMALL_THRESHOLD_BYTES), { sha256: digestOf(new Uint8Array(SMALL_THRESHOLD_BYTES)) }, {}, {
      capabilities: nativeCaps,
      loadBackend: async () => ({
        verifyPayload: async () => {
          throw new Error("backend crashed");
        },
      }),
    });
    expect(blewUp.ok).toBe(true);
    const routedDefault = await verifyInMemory(new Uint8Array(SMALL_THRESHOLD_BYTES), {
      sha256: digestOf(new Uint8Array(SMALL_THRESHOLD_BYTES)),
    }, {}, { capabilities: nativeCaps });
    expect(routedDefault.ok).toBe(true);
    const plain = await verifyInMemory(payload, { sha256: hash });
    expect(plain).toMatchObject({ ok: true, sha256: hash });
    expect(await defaultLoadBackend("js")).toBeNull();
    for (const backend of ["wasm", "native", "gpu"] as const) {
      const loaded = await defaultLoadBackend(backend);
      expect(loaded === null || typeof loaded === "object").toBe(true);
    }
    await expect(defaultLoadBackend("other" as BackendName)).rejects.toThrow(/other/);
  });

  it("routes batch checks and keeps per-item JavaScript results", async () => {
    expect(await verifyBatch([])).toEqual([]);
    const small = textBytes("batch-item");
    const smallHash = digestOf(small);
    const jsBatch = await verifyBatch(
      [
        { payload: small, manifest: { sha256: smallHash, mime: "text/plain" } },
        { payload: small, manifest: { sha256: smallHash, filename: "other.txt" }, observed: { filename: "item.txt" } },
      ],
      {
        capabilities: gpuCaps,
        loadBackend: async () => {
          throw new Error("small batches stay in JavaScript");
        },
      },
    );
    expect(jsBatch[0]).toMatchObject({ reason: "mime-mismatch" });
    expect(jsBatch[1]).toMatchObject({ reason: "filename-mismatch" });
    const matched = await verifyBatch(
      [{ payload: small, manifest: { sha256: smallHash, filename: "item.txt" }, observed: { filename: "item.txt" } }],
      { hashSource: "node" },
    );
    expect(matched[0]).toMatchObject({ ok: true, sha256: smallHash });

    const accelerated = await verifyBatch([{ payload: new Uint8Array(GPU_THRESHOLD_BYTES), manifest: { sha256: "ab" } }], {
      capabilities: gpuCaps,
      loadBackend: async () => ({ verifyBatch: async () => [{ ok: true, sha256: "batch", byteLength: 4 }] }),
    });
    expect(accelerated).toEqual([{ ok: true, sha256: "batch", byteLength: 4 }]);

    const rejected = await verifyBatch([{ payload: new Uint8Array(SMALL_THRESHOLD_BYTES), manifest: { sha256: digestOf(new Uint8Array(SMALL_THRESHOLD_BYTES)) } }], {
      capabilities: nativeCaps,
      loadBackend: async () => ({ verifyBatch: async () => [{ ok: false }] }),
    });
    expect(rejected).toEqual([{ ok: false }]);

    const fallback = await verifyBatch([{ payload: new Uint8Array(SMALL_THRESHOLD_BYTES), manifest: { sha256: digestOf(new Uint8Array(SMALL_THRESHOLD_BYTES)) } }], {
      capabilities: wasmCaps,
      loadBackend: async () => ({ verifyBatch: async () => "nope" }),
    });
    expect(fallback[0]).toMatchObject({ ok: true });
    const emptyList = await verifyBatch([{ payload: new Uint8Array(SMALL_THRESHOLD_BYTES), manifest: { sha256: "ab" } }], {
      capabilities: nativeCaps,
      loadBackend: async () => ({ verifyBatch: async () => [] }),
    });
    expect(emptyList).toEqual([]);
    const badList = await verifyBatch([{ payload: new Uint8Array(SMALL_THRESHOLD_BYTES), manifest: { sha256: digestOf(new Uint8Array(SMALL_THRESHOLD_BYTES)) } }], {
      capabilities: nativeCaps,
      loadBackend: async () => ({ verifyBatch: async () => [1] }),
    });
    expect(badList[0]).toMatchObject({ ok: true });
    const crashed = await verifyBatch([{ payload: new Uint8Array(SMALL_THRESHOLD_BYTES), manifest: { sha256: digestOf(new Uint8Array(SMALL_THRESHOLD_BYTES)) } }], {
      capabilities: nativeCaps,
      loadBackend: async () => ({
        verifyBatch: async () => {
          throw new Error("batch crashed");
        },
      }),
    });
    expect(crashed[0]).toMatchObject({ ok: true });
    const missingMethod = await verifyBatch([{ payload: new Uint8Array(SMALL_THRESHOLD_BYTES), manifest: { sha256: digestOf(new Uint8Array(SMALL_THRESHOLD_BYTES)) } }], {
      capabilities: nativeCaps,
      loadBackend: async () => ({}),
    });
    expect(missingMethod[0]).toMatchObject({ ok: true });
    const unprobed = await verifyBatch([{ payload: small, manifest: { sha256: smallHash } }]);
    expect(unprobed[0]).toMatchObject({ ok: true, sha256: smallHash });
  });
});
