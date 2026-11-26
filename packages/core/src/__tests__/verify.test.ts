import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hashBuffer,
  hexFromBytes,
  normalizeHex,
  verifiersFrom,
  verifyBuffer,
  verifyStream,
  type Verifier,
} from "../verify";

const encoder = new TextEncoder();
const payload = encoder.encode("adaptate-verify");

async function sha(bytes: Uint8Array, algorithm: AlgorithmIdentifier = "SHA-256") {
  return hexFromBytes(new Uint8Array(await crypto.subtle.digest(algorithm, new Uint8Array(bytes))));
}

describe("hex helpers", () => {
  it("encodes bytes and normalizes hex with an optional 0x prefix", () => {
    expect(hexFromBytes(new Uint8Array([0, 15, 255]))).toBe("000fff");
    expect(normalizeHex("  0xAB CD  ")).toBe("ab cd");
    expect(normalizeHex("0Xff")).toBe("ff");
    expect(normalizeHex("Ae")).toBe("ae");
  });
});

describe("hashBuffer", () => {
  it("hashes with SHA-256 by default and accepts other algorithms", async () => {
    expect(await hashBuffer(payload)).toMatchObject({
      ok: true,
      value: await sha(payload),
    });
    expect(await hashBuffer(payload, "SHA-384")).toMatchObject({
      ok: true,
      value: await sha(payload, "SHA-384"),
    });
    expect(await hashBuffer(payload, "SHA-512")).toMatchObject({
      ok: true,
      value: await sha(payload, "SHA-512"),
    });
  });

  it("fails closed when Web Crypto is missing or digest throws", async () => {
    const original = globalThis.crypto;
    vi.stubGlobal("crypto", { subtle: undefined });
    expect(await hashBuffer(payload)).toMatchObject({
      ok: false,
      failures: [{ check: "hash", message: expect.stringMatching(/unavailable/) }],
    });
    vi.stubGlobal("crypto", {});
    expect((await hashBuffer(payload)).ok).toBe(false);
    vi.stubGlobal("crypto", {
      subtle: {
        digest: async () => {
          throw new Error("digest broke");
        },
      },
    });
    expect(await hashBuffer(payload)).toMatchObject({
      ok: false,
      failures: [{ check: "hash", message: "digest broke" }],
    });
    vi.stubGlobal("crypto", {
      subtle: {
        digest: async () => {
          throw "bare-fail";
        },
      },
    });
    expect(await hashBuffer(payload)).toMatchObject({
      ok: false,
      failures: [{ check: "hash", message: "bare-fail" }],
    });
    vi.stubGlobal("crypto", original);
  });
});

describe("verifyBuffer", () => {
  it("accepts a matching hash, size, mime, and name", async () => {
    const result = await verifyBuffer(payload, {
      hash: { value: `0x${await sha(payload)}` },
      size: payload.byteLength,
      mime: "text/plain",
      name: "note.txt",
    }, { mime: "text/plain", name: "note.txt" });
    expect(result).toEqual({ ok: true, value: payload });
  });

  it("fails closed with typed errors for each mismatched check", async () => {
    const result = await verifyBuffer(
      payload,
      {
        hash: { algorithm: "SHA-256", value: "00" },
        size: 1,
        mime: "application/json",
        name: "other.bin",
      },
      { mime: "text/plain", name: "note.txt" },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures.map((failure) => failure.check)).toEqual([
      "size",
      "mime",
      "name",
      "hash",
    ]);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ check: "size", expected: 1, actual: payload.byteLength }),
        expect.objectContaining({
          check: "mime",
          expected: "application/json",
          actual: "text/plain",
        }),
        expect.objectContaining({
          check: "name",
          expected: "other.bin",
          actual: "note.txt",
        }),
        expect.objectContaining({
          check: "hash",
          expected: "00",
          actual: await sha(payload),
        }),
      ]),
    );
  });

  it("fails closed when mime or name is missing from the context", async () => {
    const result = await verifyBuffer(payload, {
      mime: "text/plain",
      name: "note.txt",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toEqual([
      expect.objectContaining({ check: "mime", expected: "text/plain", actual: undefined }),
      expect.objectContaining({ check: "name", expected: "note.txt", actual: undefined }),
    ]);
  });

  it("fails closed when no checks are provided", async () => {
    expect(await verifyBuffer(payload, {})).toMatchObject({
      ok: false,
      failures: [{ check: "custom", message: expect.stringMatching(/No verification checks/) }],
    });
    expect(await verifyBuffer(payload, [])).toMatchObject({
      ok: false,
      failures: [{ check: "custom" }],
    });
  });

  it("runs formal and custom verifiers and treats thrown checks as failures", async () => {
    const formalOk: Verifier = {
      check: "formal",
      verify: ({ bytes }) => ({ ok: true, value: bytes }),
    };
    const formalFnPass = await verifyBuffer(payload, {
      formal: ({ bytes }) => ({ ok: true, value: bytes }),
    });
    expect(formalFnPass).toEqual({ ok: true, value: payload });
    expect(await verifyBuffer(payload, { formal: formalOk })).toEqual({
      ok: true,
      value: payload,
    });

    const formalFail = await verifyBuffer(payload, {
      formal: () => ({
        ok: false,
        failures: [{ check: "formal", message: "spec broken" }],
      }),
    });
    expect(formalFail).toMatchObject({
      ok: false,
      failures: [{ check: "formal", message: "spec broken" }],
    });

    const throwing: Verifier = {
      check: "custom",
      verify() {
        throw new Error("plugin crashed");
      },
    };
    const bare: Verifier = {
      check: "custom",
      verify() {
        throw "nope";
      },
    };
    const failed = await verifyBuffer(payload, { custom: [throwing, bare] });
    expect(failed).toMatchObject({
      ok: false,
      failures: [
        { check: "custom", message: "plugin crashed" },
        { check: "custom", message: "nope" },
      ],
    });
  });

  it("propagates a hash failure from a missing digest into verifyBuffer", async () => {
    const original = globalThis.crypto;
    vi.stubGlobal("crypto", { subtle: undefined });
    const result = await verifyBuffer(payload, { hash: { value: "00" } });
    expect(result).toMatchObject({
      ok: false,
      failures: [{ check: "hash", message: expect.stringMatching(/unavailable/) }],
    });
    vi.stubGlobal("crypto", original);
  });

  it("accepts an explicit verifier list and SHA-384 manifests", async () => {
    const digest = await sha(payload, "SHA-384");
    const listed: Verifier[] = verifiersFrom({
      hash: { algorithm: "SHA-384", value: digest },
      size: payload.byteLength,
    });
    expect(listed.map((verifier) => verifier.check)).toEqual(["size", "hash"]);
    expect(await verifyBuffer(payload, listed)).toEqual({ ok: true, value: payload });
  });
});

describe("verifyStream", () => {
  it("concatenates chunks in memory and verifies before any disk write", async () => {
    async function* parts() {
      yield payload.slice(0, 4);
      yield payload.slice(4);
    }
    const result = await verifyStream(parts(), {
      hash: { value: await sha(payload) },
      size: payload.byteLength,
    });
    expect(result).toEqual({ ok: true, value: payload });
  });

  it("fails closed on a cut stream whose hash does not match", async () => {
    async function* parts() {
      yield payload.slice(0, 3);
    }
    const result = await verifyStream(
      parts(),
      { hash: { value: await sha(payload) } },
      { name: "unused" },
    );
    expect(result.ok).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
