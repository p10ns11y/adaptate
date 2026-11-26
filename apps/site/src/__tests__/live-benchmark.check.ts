import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { formatMs, median, payloadFor, payloadSizes, renderLiveBenchmark, takeawayFor } from "../site/live-benchmark";

let siteRoot = new URL("../../", import.meta.url);

describe("live benchmark helpers", () => {
  it("builds deterministic payloads and reports a median", () => {
    expect(payloadSizes.map((size) => size.label)).toEqual(["1 KiB", "32 KiB", "512 KiB", "2 MiB"]);
    expect(payloadFor(4)).toEqual(new Uint8Array([0, 1, 2, 3]));
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(formatMs(0.034)).toBe("0.034 ms");
    expect(formatMs(6.251)).toBe("6.25 ms");
  });

  it("states when zero-dep JS is the better default", () => {
    let text = takeawayFor(0.02, 0.1, "32 KiB", true);
    expect(text).toMatch(/digests match/i);
    expect(text).toMatch(/@adaptate\/core\/verify/);
    expect(text).toMatch(/3 µs/);
    expect(text).not.toMatch(/\b(demo|gate)\b/i);
    expect(takeawayFor(6, 4, "2 MiB", true)).toMatch(/WASM was faster/);
  });

  it("renders a live benchmark panel without banned words", () => {
    let html = renderLiveBenchmark();
    expect(html).toContain("Run live benchmark");
    expect(html).toContain('id="live-benchmark"');
    expect(html).toContain("/adaptate_accel.wasm");
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(/\b(demo|gate)\b/i);
    expect(html).not.toMatch(/(?<![A-Za-z])AI(?![A-Za-z])/);
  });

  it("keeps the committed WASM binary at the measured digest", async () => {
    let { createHash } = await import("node:crypto");
    let bytes = readFileSync(new URL("public/adaptate_accel.wasm", siteRoot));
    expect(bytes.byteLength).toBe(121895);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "b69be5d128d69f9aa155dfc09446de6466edacd0692e748529fcafc4b51ec492",
    );
  });
});
