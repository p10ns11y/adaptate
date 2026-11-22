import { describe, expect, it } from "vitest";

import { buildLoadScript } from "../load-script";
import { createLoadSession } from "../session";

describe("createLoadSession", () => {
  it("keeps re-parse and incremental partials aligned on a short script", () => {
    let session = createLoadSession();
    let script = buildLoadScript({
      durationMs: 1_000,
      noteChars: 40,
      itemCount: 3,
      callCount: 3,
      seed: 7,
    });
    let first = script[0];
    if (!first) throw new Error("The short script was empty");
    let snapshot = session.absorb(first);
    for (let chunk of script.slice(1)) snapshot = session.absorb(chunk);
    snapshot = session.finish();
    expect(snapshot.status).toBe("done");
    expect(snapshot.chunks).toBe(script.length);
    expect(snapshot.calls).toHaveLength(3);
    for (let call of snapshot.calls) {
      expect(call.reparseTitle).toBe(call.incrementalTitle);
      expect(call.reparseNotes).toBe(40);
      expect(call.incrementalNotes).toBe(40);
      expect(call.reparseItems).toBe(3);
      expect(call.incrementalItems).toBe(3);
      expect(call.reparseValid).toBe(true);
      expect(call.incrementalValid).toBe(true);
    }
    expect(snapshot.tanstackFinalValid).toBe(true);
    expect(snapshot.reparse.micros.length).toBeGreaterThan(0);
    expect(snapshot.incremental.micros.length).toBeGreaterThan(0);
  });
});
