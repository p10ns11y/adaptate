import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bindingsFromInstance,
  finishScanner,
  hashWithBindings,
  isAvailable,
  loadWasmModule,
  openScanner,
  pushScanner,
  verifyWithBindings,
  wasmBinaryPath,
  type WasmBindings,
} from "../bindings.ts";
import {
  createStreamParser,
  hashPayload,
  isAvailable as packageAvailable,
  openStream,
  verifyBatch,
  verifyPayload,
} from "../index.ts";
import { parseScanText, parseVerifyListText, parseVerifyText, parseVerifyValue } from "../parse.ts";

const EMPTY_MODULE = Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00);
const HASH = "a".repeat(64);

function bindings(overrides: Partial<WasmBindings> = {}): WasmBindings {
  const memory = new WebAssembly.Memory({ initial: 1 });
  let cursor = 32;
  const base: WasmBindings = {
    memory,
    alloc(size: number) {
      const pointer = cursor;
      cursor += Math.max(size, 1);
      return pointer;
    },
    dealloc() {},
    sha256(_pointer, _length, output) {
      new Uint8Array(memory.buffer).fill(0x61, output, output + 64);
      return 64;
    },
    verify(_payload, _payloadLength, _manifest, _manifestLength, _observed, _observedLength, output) {
      return writeText(memory, output, `{"ok":true,"sha256":"${HASH}","byteLength":1}`);
    },
    scannerNew: () => 4,
    scannerFree() {},
    scannerPush(_handle, _pointer, _length, output) {
      return writeText(memory, output, '{"status":"pending","values":[]}');
    },
    scannerFinish(_handle, output) {
      return writeText(memory, output, '{"status":"ready","values":[1]}');
    },
  };
  return { ...base, ...overrides, memory: overrides.memory ?? memory };
}

function writeText(memory: WebAssembly.Memory, pointer: number, text: string): number {
  const encoded = new TextEncoder().encode(text);
  new Uint8Array(memory.buffer).set(encoded, pointer);
  return encoded.length;
}

function countedAlloc(failOn: number): WasmBindings["alloc"] {
  let calls = 0;
  return () => {
    calls += 1;
    return calls === failOn ? 0 : calls * 64;
  };
}

describe("wasm availability", () => {
  it("reports a missing binary and loads through injected hooks", async () => {
    expect(packageAvailable()).toBe(false);
    expect(isAvailable(join(tmpdir(), "missing-adaptate-accel.wasm"))).toBe(false);
    expect(wasmBinaryPath().endsWith("adaptate_accel.wasm")).toBe(true);
    const directory = mkdtempSync(join(tmpdir(), "adaptate-wasm-"));
    const emptyPath = join(directory, "empty.wasm");
    const modulePath = join(directory, "module.wasm");
    writeFileSync(emptyPath, new Uint8Array());
    writeFileSync(modulePath, EMPTY_MODULE);
    expect(isAvailable(modulePath)).toBe(true);
    expect(await loadWasmModule(join(directory, "absent.wasm"))).toMatchObject({ status: "wasm-binary-missing" });
    expect(await loadWasmModule(emptyPath)).toMatchObject({ status: "wasm-binary-missing" });
    expect(await loadWasmModule(modulePath)).toMatchObject({ status: "wasm-abi-mismatch" });
    expect(await loadWasmModule(modulePath, { readBytes: () => null })).toMatchObject({ status: "wasm-binary-missing" });
    expect(await loadWasmModule(modulePath, { readBytes: () => new Uint8Array() })).toMatchObject({
      status: "wasm-binary-missing",
    });
    expect(await loadWasmModule(modulePath, { readBytes: () => Uint8Array.of(1, 2, 3) })).toMatchObject({
      status: "wasm-load-failed",
    });
    expect(
      await loadWasmModule(modulePath, {
        readBytes: () => EMPTY_MODULE,
        instantiate: async () => {
          throw new Error("instantiate failed");
        },
      }),
    ).toMatchObject({ status: "wasm-load-failed" });
    expect(
      await loadWasmModule(modulePath, {
        readBytes: () => EMPTY_MODULE,
        mapExports: () => null,
      }),
    ).toMatchObject({ status: "wasm-abi-mismatch" });
    expect(
      await loadWasmModule(modulePath, {
        readBytes: () => EMPTY_MODULE,
        mapExports: () => bindings({ alloc: () => 0 }),
      }),
    ).toMatchObject({ status: "wasm-call-failed" });
    const loaded = await loadWasmModule(modulePath, {
      readBytes: () => EMPTY_MODULE,
      mapExports: () => bindings(),
    });
    expect(loaded.status).toBe("available");
    expect(loaded.bindings).not.toBeNull();
  });

  it("checks export shape", () => {
    expect(bindingsFromInstance({ exports: 1 } as unknown as WebAssembly.Instance)).toBeNull();
    expect(bindingsFromInstance({ exports: null } as unknown as WebAssembly.Instance)).toBeNull();
    expect(bindingsFromInstance({ exports: { memory: {} } } as unknown as WebAssembly.Instance)).toBeNull();
    const memory = new WebAssembly.Memory({ initial: 1 });
    const names = [
      "adaptate_alloc",
      "adaptate_dealloc",
      "adaptate_sha256",
      "adaptate_verify",
      "adaptate_scanner_new",
      "adaptate_scanner_free",
      "adaptate_scanner_push",
      "adaptate_scanner_finish",
    ];
    const exports: Record<string, unknown> = { memory };
    for (const name of names) exports[name] = () => 1;
    expect(bindingsFromInstance({ exports } as unknown as WebAssembly.Instance)?.alloc(0)).toBe(1);
    exports.adaptate_sha256 = 1;
    expect(bindingsFromInstance({ exports } as unknown as WebAssembly.Instance)).toBeNull();
  });
});

describe("wasm calls", () => {
  it("hashes, verifies, and scans through bindings", async () => {
    const live = bindings();
    expect(hashWithBindings(live, new Uint8Array())).toBe(HASH);
    expect(hashWithBindings(live, Uint8Array.of(1, 2))).toBe(HASH);
    expect(hashWithBindings(bindings({ alloc: () => 0 }), Uint8Array.of(1))).toBeNull();
    expect(hashWithBindings(bindings({ alloc: countedAlloc(1) }), new Uint8Array())).toBeNull();
    expect(hashWithBindings(bindings({ alloc: countedAlloc(2) }), Uint8Array.of(1))).toBeNull();
    expect(hashWithBindings(bindings({ sha256: () => -1 }), Uint8Array.of(1))).toBeNull();
    expect(
      hashWithBindings(
        bindings({
          sha256: () => {
            throw new Error("hash failed");
          },
        }),
        Uint8Array.of(1),
      ),
    ).toBeNull();

    expect(verifyWithBindings(live, Uint8Array.of(1), "", "")).toMatchObject({ ok: true });
    expect(verifyWithBindings(bindings({ alloc: countedAlloc(1) }), Uint8Array.of(1), '{"sha256":"ab"}', "{}")).toBeNull();
    expect(verifyWithBindings(bindings({ alloc: countedAlloc(2) }), Uint8Array.of(1), '{"sha256":"ab"}', "{}")).toBeNull();
    expect(verifyWithBindings(bindings({ alloc: countedAlloc(3) }), Uint8Array.of(1), '{"sha256":"ab"}', "{}")).toBeNull();
    expect(verifyWithBindings(bindings({ alloc: countedAlloc(4) }), Uint8Array.of(1), '{"sha256":"ab"}', "{}")).toBeNull();
    expect(verifyWithBindings(bindings({ verify: () => -1 }), Uint8Array.of(1), "{}", "{}")).toBeNull();
    expect(verifyWithBindings(bindings({ verify: () => 5000 }), Uint8Array.of(1), "{}", "{}")).toBeNull();
    expect(verifyWithBindings(bindings({ verify: () => 0 }), Uint8Array.of(1), "{}", "{}")).toBeNull();
    expect(
      verifyWithBindings(
        bindings({
          verify: () => {
            throw new Error("verify failed");
          },
        }),
        Uint8Array.of(1),
        "{}",
        "{}",
      ),
    ).toBeNull();

    expect(openScanner(bindings({ scannerNew: () => 0 }))).toBeNull();
    expect(openScanner(live)).toBe(4);
    expect(pushScanner(live, 4, new Uint8Array())).toMatchObject({ status: "pending" });
    expect(pushScanner(live, 4, Uint8Array.of(1))).toMatchObject({ status: "pending" });
    expect(pushScanner(bindings({ alloc: countedAlloc(1) }), 4, Uint8Array.of(1))).toBeNull();
    expect(pushScanner(bindings({ alloc: countedAlloc(2) }), 4, Uint8Array.of(1))).toBeNull();
    expect(pushScanner(bindings({ scannerPush: () => -1 }), 4, Uint8Array.of(1))).toBeNull();
    expect(pushScanner(bindings({ scannerPush: () => 5000 }), 4, Uint8Array.of(1))).toBeNull();
    expect(pushScanner(bindings({ scannerPush: () => 0 }), 4, Uint8Array.of(1))).toBeNull();
    expect(
      pushScanner(
        bindings({
          scannerPush: () => {
            throw new Error("push failed");
          },
        }),
        4,
        Uint8Array.of(1),
      ),
    ).toBeNull();
    expect(finishScanner(live, 4)).toMatchObject({ status: "ready" });
    expect(finishScanner(bindings({ alloc: () => 0 }), 4)).toBeNull();
    expect(finishScanner(bindings({ scannerFinish: () => -1 }), 4)).toBeNull();
    expect(finishScanner(bindings({ scannerFinish: () => 9000 }), 4)).toBeNull();
    expect(
      finishScanner(
        bindings({
          scannerFinish: () => {
            throw new Error("finish failed");
          },
        }),
        4,
      ),
    ).toBeNull();

    const closed = bindings();
    let freed = 0;
    closed.scannerFree = () => {
      freed += 1;
    };
    const stream = openStream(closed);
    expect(stream.available).toBe(true);
    if (!stream.available) return;
    expect(stream.push(Uint8Array.of(1))).toMatchObject({ status: "pending" });
    expect(stream.finish()).toMatchObject({ status: "ready" });
    stream.close();
    expect(freed).toBe(1);
    expect(openStream(bindings({ scannerNew: () => 0 }))).toEqual({ available: false, status: "wasm-call-failed" });
    const broken = openStream(bindings({ scannerPush: () => -1, scannerFinish: () => -1 }));
    if (!broken.available) throw new Error("scanner handle was not opened");
    expect(broken.push(Uint8Array.of(1))).toEqual({ available: false, status: "wasm-runtime-failed" });
    expect(broken.finish()).toEqual({ available: false, status: "wasm-runtime-failed" });

    const hooks = { readBytes: () => EMPTY_MODULE, mapExports: () => bindings() };
    expect(await hashPayload(Uint8Array.of(1), hooks)).toBe(HASH);
    expect(await hashPayload(Uint8Array.of(1), { readBytes: () => null })).toMatchObject({ status: "wasm-binary-missing" });
    expect(await hashPayload(Uint8Array.of(1), { readBytes: () => EMPTY_MODULE, mapExports: () => bindings({ sha256: () => -1 }) })).toMatchObject({
      status: "wasm-runtime-failed",
    });
    expect(await verifyPayload(Uint8Array.of(1), { sha256: HASH }, { mime: "text/plain" }, hooks)).toMatchObject({ ok: true });
    expect(await verifyPayload(Uint8Array.of(1), { sha256: HASH }, undefined, hooks)).toMatchObject({ ok: true });
    expect(
      await verifyPayload(Uint8Array.of(1), { sha256: HASH }, {}, {
        readBytes: () => EMPTY_MODULE,
        mapExports: () => bindings({ verify: () => -1 }),
      }),
    ).toMatchObject({ status: "wasm-runtime-failed" });
    expect(await verifyPayload(Uint8Array.of(1), { sha256: HASH })).toMatchObject({ available: false });
    expect(await verifyBatch([], hooks)).toEqual([]);
    expect(await verifyBatch([{ payload: Uint8Array.of(1), manifest: { sha256: HASH } }], hooks)).toEqual([
      expect.objectContaining({ ok: true }),
    ]);
    expect(
      await verifyBatch([{ payload: Uint8Array.of(1), manifest: { sha256: HASH }, observed: { filename: "a.txt" } }], {
        readBytes: () => EMPTY_MODULE,
        mapExports: () => bindings({ verify: () => -1 }),
      }),
    ).toMatchObject({ status: "wasm-runtime-failed" });
    expect(await verifyBatch([{ payload: Uint8Array.of(1), manifest: { sha256: HASH } }])).toMatchObject({
      available: false,
    });
    const parser = await createStreamParser(hooks);
    expect(parser.available).toBe(true);
    if (!parser.available) return;
    expect(parser.push(Uint8Array.of(1))).toMatchObject({ status: "pending" });
    expect(parser.finish()).toMatchObject({ status: "ready" });
    parser.close();
    expect(await createStreamParser({ readBytes: () => null })).toMatchObject({ status: "wasm-binary-missing" });
    expect(await hashPayload(new Uint8Array())).toMatchObject({ available: false });
  });
});

describe("wasm result parser", () => {
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
    expect(parseVerifyListText('[{"ok":true,"sha256":"ab","byteLength":1}]')).toEqual([
      { ok: true, sha256: "ab", byteLength: 1 },
    ]);
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
    expect(parseVerifyValue({ ok: false, reason: "hash-mismatch", expected: "a", actual: "b" })).toEqual({
      ok: false,
      reason: "hash-mismatch",
      expected: "a",
      actual: "b",
    });
    expect(parseVerifyValue({ ok: false, reason: "size-mismatch", actual: "1", expected: 2 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-mismatch", actual: 1, expected: "2" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-mismatch", actual: 1, expected: 2 })).toMatchObject({
      reason: "size-mismatch",
    });
    expect(parseVerifyValue({ ok: false, reason: "size-below-min", actual: "1", min: 2 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-below-min", actual: 1, min: "2" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-below-min", actual: 1, min: 2 })).toMatchObject({
      reason: "size-below-min",
    });
    expect(parseVerifyValue({ ok: false, reason: "size-above-max", actual: "1", max: 2 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-above-max", actual: 1, max: "2" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "size-above-max", actual: 1, max: 2 })).toMatchObject({
      reason: "size-above-max",
    });
    expect(parseVerifyValue({ ok: false, reason: "mime-mismatch", expected: 1, actual: "a" })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "mime-mismatch", expected: "a", actual: 1 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "mime-mismatch", expected: "a", actual: null })).toMatchObject({
      actual: null,
    });
    expect(parseVerifyValue({ ok: false, reason: "mime-mismatch", expected: "a", actual: "b" })).toMatchObject({
      actual: "b",
    });
    expect(parseVerifyValue({ ok: false, reason: "filename-mismatch", expected: 1, actual: null })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "filename-mismatch", expected: "a", actual: 1 })).toBeNull();
    expect(parseVerifyValue({ ok: false, reason: "filename-mismatch", expected: "a", actual: null })).toMatchObject({
      reason: "filename-mismatch",
    });
    expect(parseVerifyValue({ ok: false, reason: "filename-mismatch", expected: "a", actual: "b" })).toMatchObject({
      actual: "b",
    });
    expect(parseVerifyValue({ ok: false, reason: "other" })).toBeNull();
    expect(parseVerifyValue({ ok: false })).toBeNull();
  });
});
