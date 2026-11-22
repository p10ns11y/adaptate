import { describe, expect, it } from "vitest";

import {
  buildLoadScript,
  defaultCallCount,
  defaultItemCount,
  defaultNoteChars,
  defaultRunMs,
  describeChunk,
} from "../load-script";

describe("buildLoadScript", () => {
  it("spreads heavy parallel calls across the full minute", () => {
    let script = buildLoadScript();
    let byCall = new Map<string, string>();
    let protocols = new Set<string>();
    for (let chunk of script) {
      protocols.add(chunk.protocol);
      byCall.set(chunk.toolCallId, `${byCall.get(chunk.toolCallId) ?? ""}${chunk.delta}`);
      expect(chunk.delta.length).toBeGreaterThan(0);
      expect(describeChunk(chunk).length).toBeGreaterThan(0);
    }
    expect(script.length).toBeGreaterThan(1_000);
    expect(byCall.size).toBe(defaultCallCount);
    expect(protocols).toEqual(new Set(["ag-ui", "openai", "anthropic"]));
    expect(script[0]?.atMs).toBe(0);
    expect(script[script.length - 1]?.atMs).toBeGreaterThan(59_000);
    expect(script[script.length - 1]?.atMs).toBeLessThan(defaultRunMs);
    for (let document of byCall.values()) {
      let parsed = JSON.parse(document) as { notes: string; items: unknown[]; title: string };
      expect(parsed.notes).toHaveLength(defaultNoteChars);
      expect(parsed.items).toHaveLength(defaultItemCount);
      expect(parsed.title.startsWith("Batch ")).toBe(true);
    }
  });
});
