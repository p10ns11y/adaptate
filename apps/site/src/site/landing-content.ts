import { escapeHtml } from "./head.ts";
import { repositoryUrl } from "./config.ts";

export type PerfRun = {
  commit: string;
  runtimeVersion: string;
  fullDocument: Record<string, number>;
  importMedianMs: Record<string, number>;
  parsedPartialMicros: Record<string, number>;
  agUiMicros: Record<string, number>;
  bundleOwn: Array<{ id: string; minBytes: number; gzipBytes: number }>;
};

export type StreamDemo = {
  delta: string;
  jsonParseError: string;
  partial: unknown;
  cardValid: boolean;
};

let libraries = ["adaptate", "zod", "valibot"];

function number(value: number | undefined, digits: number): string {
  if (value === undefined) return "n/a";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function renderMeasured(run: PerfRun): string {
  let short = run.commit.slice(0, 7);
  let header = `<tr><th scope="col">Measure</th>${libraries.map((name) => `<th scope="col">${name}</th>`).join("")}</tr>`;
  let row = (label: string, values: Record<string, number>, digits: number) =>
    `<tr><th scope="row">${label}</th>${libraries.map((name) => `<td>${number(values[name], digits)}</td>`).join("")}</tr>`;
  let rows = [
    row("Full document validations/s", run.fullDocument, 0),
    row("Import median, ms", run.importMedianMs, 1),
    row("Parsed partial, µs/chunk", run.parsedPartialMicros, 3),
  ].join("");
  let agUi = number(run.agUiMicros.adaptate, 3);
  let bundles = run.bundleOwn
    .map((entry) => `<code>${escapeHtml(entry.id === "." ? "@adaptate/core" : `@adaptate/core${entry.id.slice(1)}`)}</code> ${number(entry.gzipBytes / 1024, 1)} KB`)
    .join(", ");
  return [
    `<table class="numbers"><caption class="muted">One local run of <code>node bench/ab/run.js</code> on Node ${escapeHtml(run.runtimeVersion)}</caption><thead>${header}</thead><tbody>${rows}</tbody></table>`,
    `<p>AG-UI on <code>@adaptate/core/stream-incremental</code>: ${agUi} µs/chunk. Zod and valibot alone cannot check a partial document, so they need the complete JSON first.</p>`,
    `<p>Gzip size of each entry point, with zod external: ${bundles}.</p>`,
    `<p class="muted">Commit <a href="${repositoryUrl}/commit/${escapeHtml(run.commit)}"><code>${escapeHtml(short)}</code></a>. <a href="/docs/performance/">How it was measured</a>.</p>`,
  ].join("");
}

export function renderBeforeAfter(demo: StreamDemo): string {
  let partial = escapeHtml(JSON.stringify(demo.partial));
  let delta = escapeHtml(demo.delta);
  return [
    `<div class="compare">`,
    `<div class="panel"><h3>Without adaptate</h3>`,
    `<pre><code>const args = '${delta}';\nJSON.parse(args);</code></pre>`,
    `<p class="verdict fail">Throws: ${escapeHtml(demo.jsonParseError)}</p><p>The card stays blank until the last byte arrives.</p></div>`,
    `<div class="panel"><h3>With adaptate</h3>`,
    `<pre><code>const check = push({\n  type: "TOOL_CALL_ARGS",\n  toolCallId: "call-1",\n  delta: '${delta}',\n});</code></pre>`,
    `<p class="verdict pass">check.partial is <code>${partial}</code>. The card check is ${demo.cardValid ? "valid" : "not valid"}.</p><p><code>push</code> comes from <code>createAgUiPartialValidator</code> in <code>@adaptate/core/stream</code>.</p></div>`,
    `</div>`,
  ].join("");
}

export function renderExamplesFallback(fileName: string, source: string): string {
  return `<p class="muted">${escapeHtml(fileName)}</p><pre tabindex="0"><code>${escapeHtml(source)}</code></pre>`;
}
