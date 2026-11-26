import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { hexFromBytes, verifyBuffer, verifyStream } from "../verify";

async function sha256(bytes: Uint8Array) {
  return hexFromBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))));
}

describe("verify properties", () => {
  it("accepts every buffer against its own hash and size, and rejects a mutated copy", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 64 }), async (bytes) => {
        const digest = await sha256(bytes);
        const passed = await verifyBuffer(bytes, {
          hash: { value: digest },
          size: bytes.byteLength,
        });
        expect(passed).toEqual({ ok: true, value: bytes });

        async function* parts() {
          if (bytes.byteLength === 0) return;
          const mid = Math.floor(bytes.byteLength / 2);
          yield bytes.slice(0, mid);
          yield bytes.slice(mid);
        }
        const streamed = await verifyStream(parts(), {
          hash: { value: `0x${digest}` },
          size: bytes.byteLength,
        });
        expect(streamed.ok).toBe(true);
        if (streamed.ok) expect(streamed.value).toEqual(bytes);

        const mutated = new Uint8Array(bytes);
        if (mutated.byteLength === 0) {
          const rejectedEmpty = await verifyBuffer(new Uint8Array([1]), {
            hash: { value: digest },
            size: 0,
          });
          expect(rejectedEmpty.ok).toBe(false);
          return;
        }
        mutated[0] = (mutated[0] + 1) & 0xff;
        const rejected = await verifyBuffer(mutated, {
          hash: { value: digest },
          size: bytes.byteLength,
        });
        expect(rejected.ok).toBe(false);
      }),
      { numRuns: 25 },
    );
  });
});
