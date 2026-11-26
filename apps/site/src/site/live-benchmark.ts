export const WASM_URL = "/adaptate_accel.wasm";
export const RUNS = 7;

export const payloadSizes = [
  { label: "1 KiB", bytes: 1024 },
  { label: "32 KiB", bytes: 32 * 1024 },
  { label: "512 KiB", bytes: 512 * 1024 },
  { label: "2 MiB", bytes: 2 * 1024 * 1024 },
] as const;

export type PayloadSize = (typeof payloadSizes)[number];

export function payloadFor(bytes: number): Uint8Array {
  const payload = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index += 1) payload[index] = index & 0xff;
  return payload;
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const right = sorted[mid];
  const left = sorted[mid - 1];
  if (right === undefined) return Number.NaN;
  if (sorted.length % 2 === 1 || left === undefined) return right;
  return (left + right) / 2;
}

export function formatMs(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value < 0.1) return `${value.toFixed(3)} ms`;
  if (value < 10) return `${value.toFixed(2)} ms`;
  return `${value.toFixed(1)} ms`;
}

export function takeawayFor(jsMedianMs: number, wasmMedianMs: number, sizeLabel: string, match: boolean): string {
  const digest = match
    ? "SHA-256 digests match."
    : "SHA-256 digests did not match; treat these timings as untrusted.";
  if (!Number.isFinite(jsMedianMs) || !Number.isFinite(wasmMedianMs)) {
    return `${digest} One of the paths did not finish, so this size has no comparison.`;
  }
  if (jsMedianMs <= wasmMedianMs) {
    return `${digest} At ${sizeLabel}, @adaptate/core/verify (Web Crypto) was faster in this browser (median ${formatMs(jsMedianMs)} vs ${formatMs(wasmMedianMs)}). That is the usual result for small and mid-size buffers, and for streaming chunks around 3 µs, where zero-dep JS already wins. WASM and native fit large or batched in-memory verification, a portable C ABI, or a Rust/WASM host embed.`;
  }
  return `${digest} At ${sizeLabel}, WASM was faster in this browser (median ${formatMs(wasmMedianMs)} vs ${formatMs(jsMedianMs)}). That is where a large buffer, batch verification, or a Rust/WASM host embed can pay off. Small streaming chunks still belong on zero-dep JS.`;
}

export function renderLiveBenchmark(): string {
  const options = payloadSizes
    .map((size, index) => {
      const checked = size.bytes === 32 * 1024 ? " checked" : "";
      const id = `live-bench-size-${index}`;
      return `<label class="chip" for="${id}"><input id="${id}" type="radio" name="live-bench-size" value="${size.bytes}"${checked}>${size.label}</label>`;
    })
    .join("");
  return [
    `<section class="live-bench" id="live-benchmark" data-wasm-url="${WASM_URL}">`,
    `<p class="kicker">Live benchmark</p>`,
    `<h2 id="live-benchmark-heading">Run it in this browser</h2>`,
    `<p>This page loads the real C ABI <code>adaptate_accel.wasm</code> and times <code>@adaptate/core/verify</code> against <code>@adaptate/wasm</code> on a buffer you pick. Numbers come from this visit, not a recorded table.</p>`,
    `<fieldset class="live-bench-sizes"><legend class="sr-only">Payload size</legend>${options}</fieldset>`,
    `<button type="button" class="button" data-run-live-benchmark>Run live benchmark</button>`,
    `<p class="live-bench-status" role="status" aria-live="polite">Pick a size and run the live benchmark to see real timings and a SHA-256 digest check.</p>`,
    `<div class="live-bench-results" hidden></div>`,
    `</section>`,
  ].join("");
}
