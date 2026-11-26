import { hashBuffer } from "@adaptate/core/verify";
import { createWasmBindings, hashWithBindings, type WasmBindings } from "@adaptate/wasm/runtime";

import {
  RUNS,
  WASM_URL,
  formatMs,
  median,
  payloadFor,
  payloadSizes,
  takeawayFor,
  type PayloadSize,
} from "../site/live-benchmark.ts";

export type TimedDigest = {
  digest: string;
  timesMs: number[];
};

export type LiveBenchmarkResult = {
  sizeLabel: string;
  bytes: number;
  loadMs: number;
  js: TimedDigest;
  wasm: TimedDigest;
  match: boolean;
  takeaway: string;
};

let bindingsPromise: Promise<{ bindings: WasmBindings; loadMs: number }> | undefined;

export async function loadWasmBindings(wasmUrl = WASM_URL): Promise<{ bindings: WasmBindings; loadMs: number }> {
  if (!bindingsPromise) {
    bindingsPromise = (async () => {
      const started = performance.now();
      const response = await fetch(wasmUrl);
      if (!response.ok) throw new Error(`Could not load ${wasmUrl} (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const loaded = await createWasmBindings(bytes);
      if (!loaded.bindings) throw new Error(`WASM bindings were not available (${loaded.status}).`);
      return { bindings: loaded.bindings, loadMs: performance.now() - started };
    })();
  }
  return bindingsPromise;
}

async function timeJsHash(payload: Uint8Array, runs: number): Promise<TimedDigest> {
  const timesMs: number[] = [];
  let digest = "";
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    const hashed = await hashBuffer(payload);
    timesMs.push(performance.now() - started);
    if (!hashed.ok) throw new Error(hashed.failures[0]?.message ?? "JS hash failed closed.");
    digest = hashed.value;
  }
  return { digest, timesMs };
}

function timeWasmHash(bindings: WasmBindings, payload: Uint8Array, runs: number): TimedDigest {
  const timesMs: number[] = [];
  let digest = "";
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    const hashed = hashWithBindings(bindings, payload);
    timesMs.push(performance.now() - started);
    if (hashed === null) throw new Error("WASM hash failed.");
    digest = hashed;
  }
  return { digest, timesMs };
}

export async function runLiveBenchmark(
  size: PayloadSize,
  options: { runs?: number; wasmUrl?: string } = {},
): Promise<LiveBenchmarkResult> {
  const runs = options.runs ?? RUNS;
  const payload = payloadFor(size.bytes);
  const loaded = await loadWasmBindings(options.wasmUrl);
  await timeJsHash(payload, 1);
  timeWasmHash(loaded.bindings, payload, 1);
  const js = await timeJsHash(payload, runs);
  const wasm = timeWasmHash(loaded.bindings, payload, runs);
  const match = js.digest === wasm.digest && js.digest.length === 64;
  return {
    sizeLabel: size.label,
    bytes: size.bytes,
    loadMs: loaded.loadMs,
    js,
    wasm,
    match,
    takeaway: takeawayFor(median(js.timesMs), median(wasm.timesMs), size.label, match),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderResults(result: LiveBenchmarkResult): string {
  const rows = [
    ["Payload", `${result.sizeLabel} (${result.bytes.toLocaleString("en")} bytes)`],
    ["WASM module load", formatMs(result.loadMs)],
    ["@adaptate/core/verify median", formatMs(median(result.js.timesMs))],
    ["@adaptate/wasm median", formatMs(median(result.wasm.timesMs))],
    ["Digest match", result.match ? "Yes" : "No"],
    ["SHA-256", result.js.digest],
  ];
  const table = rows
    .map(([label, value]) => `<div><dt>${escapeHtml(label ?? "")}</dt><dd>${escapeHtml(value ?? "")}</dd></div>`)
    .join("");
  return `<dl class="live-bench-table">${table}</dl><p class="live-bench-takeaway">${escapeHtml(result.takeaway)}</p>`;
}

export function mountLiveBenchmark(root: ParentNode = document): void {
  const panel = root.querySelector<HTMLElement>("#live-benchmark");
  if (!panel || panel.dataset.mounted === "true") return;
  panel.dataset.mounted = "true";
  const button = panel.querySelector<HTMLButtonElement>("[data-run-live-benchmark]");
  const status = panel.querySelector<HTMLElement>(".live-bench-status");
  const results = panel.querySelector<HTMLElement>(".live-bench-results");
  if (!button || !status || !results) return;

  button.addEventListener("click", () => {
    void (async () => {
      const selected = panel.querySelector<HTMLInputElement>('input[name="live-bench-size"]:checked');
      const bytes = Number(selected?.value ?? 32 * 1024);
      const size = payloadSizes.find((entry) => entry.bytes === bytes) ?? payloadSizes[1]!;
      button.disabled = true;
      status.textContent = `Running the ${size.label} live benchmark…`;
      results.hidden = true;
      try {
        const result = await runLiveBenchmark(size, { wasmUrl: panel.dataset.wasmUrl ?? WASM_URL });
        results.innerHTML = renderResults(result);
        results.hidden = false;
        status.textContent = result.match
          ? `Finished ${size.label}: digests match.`
          : `Finished ${size.label}: digests did not match.`;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        results.hidden = true;
        status.textContent = `The live benchmark could not finish. ${message}`;
      } finally {
        button.disabled = false;
      }
    })();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mountLiveBenchmark());
else mountLiveBenchmark();
