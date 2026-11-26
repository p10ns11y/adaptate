import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { orderViewConfigs } from "./order.js";

function readJson(directory, name) {
  const file = resolve(directory, name);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function signed(value, digits) {
  const text = value.toFixed(digits);
  return value > 0 ? `+${text}` : text;
}

function percent(delta, base) {
  if (!(base > 0)) return "n/a";
  return `${signed((delta / base) * 100, 3)}%`;
}

function group(value) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function overhead(delta, base, rendered) {
  return `${rendered} (${percent(delta, base)})`;
}

function metricRow(label, runtime, left, right, reference, deltaText) {
  return `| ${label} | ${runtime} | ${left} | ${right} | ${deltaText} | ${reference} |`;
}

function formatValue(value, digits) {
  if (value == null || Number.isNaN(value)) return "n/a";
  if (digits == null) return group(value);
  return value.toFixed(digits);
}

export function renderSummary(directory) {
  const node = readJson(directory, "node.json");
  const bun = readJson(directory, "bun.json");
  const browser = readJson(directory, "browser.json");
  const bundle = readJson(directory, "bundle.json");
  const gate = readJson(directory, "gate.json");
  const crossover = readJson(directory, "crossover.json");
  const lines = [];
  const sample = node || bun || browser;
  if (!sample) {
    lines.push("No A/B results were written.");
    return lines.join("\n");
  }
  lines.push(
    `Workload: grocery order, ${sample.documentBytes} bytes, ${sample.chunkCount} \`TOOL_CALL_ARGS\` deltas of 24 characters. Import time includes module evaluation and one full-document validation. Node and Bun use a fresh process per sample, median and p95 of ${sample.coldSamples} samples after one discarded warmup. Chromium uses a fresh page per sample and no discarded warmup. Full-document and per-chunk rates are the median of ${sample.rounds} passes of ${sample.budgetMs} ms, one variant per process (Node, Bun) or page (Chromium). Node and Bun clocks are \`process.hrtime.bigint\`. The browser clock is \`performance.now\`.`,
  );
  lines.push("");
  lines.push("| Metric | Runtime | A raw zod | B zod + adaptate | B vs A | C valibot |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const runtime of [node, bun, browser].filter(Boolean)) {
    const label =
      runtime.runtime === "browser"
        ? `Chromium ${runtime.runtimeVersion}`
        : runtime.runtime === "bun"
          ? `Bun ${runtime.runtimeVersion}`
          : `Node ${runtime.runtimeVersion}`;
    const zod = runtime.variants.zod;
    const adaptate = runtime.variants.adaptate;
    const valibot = runtime.variants.valibot;
    const push = (metric, key, digits, unit) => {
      const left = formatValue(zod[key], digits);
      const right = formatValue(adaptate[key], digits);
      const reference = formatValue(valibot[key], digits);
      if (zod[key] == null || adaptate[key] == null) {
        lines.push(metricRow(metric, label, left, right, reference, "n/a"));
        return;
      }
      const delta = adaptate[key] - zod[key];
      const rendered =
        digits == null ? `${group(delta)} ${unit}` : `${signed(delta, digits)} ${unit}`;
      lines.push(
        metricRow(metric, label, left, right, reference, overhead(delta, zod[key], rendered)),
      );
    };
    push("Import median (ms)", "coldMedianMs", 3, "ms");
    push("Import p95 (ms)", "coldP95Ms", 3, "ms");
    push("Full document (validations/sec)", "validationsPerSec", null, "/s");
    if (typeof adaptate.viewsPerSec === "number") {
      push(
        `${orderViewConfigs.length} views per render (renders/sec)`,
        "viewsPerSec",
        null,
        "/s",
      );
    }
    push("AG-UI stream (µs/chunk)", "agUiMicros", 3, "µs");
    if (typeof adaptate.repairMicros === "number") {
      lines.push(
        metricRow(
          "JSON repair (µs/chunk)",
          label,
          "no repair: needs complete JSON",
          formatValue(adaptate.repairMicros, 3),
          "no repair: needs complete JSON",
          "n/a",
        ),
      );
    }
    push(
      "Parsed partial check, cached schema (µs/chunk)",
      "partialMicros",
      3,
      "µs",
    );
    if (runtime.heapTrials) {
      push("Heap after GC (bytes)", "heapAfterBytes", null, "B");
      push("Heap delta after GC (bytes)", "heapDeltaBytes", null, "B");
    }
  }
  if (bundle) {
    lines.push(
      metricRow(
        "zod-only min / gzip (bytes)",
        `esbuild ${bundle.esbuildVersion}`,
        `${group(bundle.zodOnly.minBytes)} / ${group(bundle.zodOnly.gzipBytes)}`,
        "—",
        "baseline",
        "—",
      ),
    );
    for (const entry of bundle.entries) {
      const effectNote = entry.effectExternal ? ", effect external" : "";
      const fullDeltaMin = entry.full.minBytes - bundle.zodOnly.minBytes;
      const fullDeltaGzip = entry.full.gzipBytes - bundle.zodOnly.gzipBytes;
      lines.push(
        metricRow(
          `\`${entry.id}\` min / gzip${effectNote}`,
          `esbuild ${bundle.esbuildVersion}`,
          entry.includesZod
            ? `${group(bundle.zodOnly.minBytes)} / ${group(bundle.zodOnly.gzipBytes)}`
            : "—",
          `${group(entry.full.minBytes)} / ${group(entry.full.gzipBytes)}`,
          "—",
          entry.includesZod
            ? `${group(fullDeltaMin)} / ${group(fullDeltaGzip)} B (${percent(fullDeltaGzip, bundle.zodOnly.gzipBytes)} gzip)`
            : `${group(entry.full.minBytes)} / ${group(entry.full.gzipBytes)} B`,
        ),
      );
      lines.push(
        metricRow(
          `\`${entry.id}\` own min / gzip, zod external${effectNote}`,
          `esbuild ${bundle.esbuildVersion}`,
          "—",
          `${group(entry.own.minBytes)} / ${group(entry.own.gzipBytes)}`,
          "—",
          `+${group(entry.own.minBytes)} / +${group(entry.own.gzipBytes)} B`,
        ),
      );
    }
  }
  lines.push("");
  lines.push(
    "Gated on pull request, Node only, head build versus the base commit on the same runner, fail above 5%: adaptate import median, full-document validations/sec, AG-UI µs/chunk, parsed-partial µs/chunk, and each entry's min and gzip bytes (full bundle and zod-external bundle). Not gated: JSON repair, four views per render, import p95, heap, the raw-zod rows, Bun, and Chromium.",
  );
  if (crossover?.rows) {
    lines.push("");
    lines.push("Crossover baselines (JS parse and SHA-256):");
    lines.push("| Size | Payload bytes | Parse MB/s | Hash MB/s | Parse µs/chunk |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of crossover.rows) {
      lines.push(
        `| ${row.name} | ${group(row.payloadBytes)} | ${formatValue(row.parseMbPerSec, 3)} | ${formatValue(row.hashMbPerSec, 3)} | ${formatValue(row.parseUsPerChunk, 3)} |`,
      );
    }
  }
  if (gate) {
    lines.push("");
    lines.push(`Gate: ${gate.failed ? "FAIL" : "PASS"} (limit ${gate.limit}).`);
    const failedRows = [...gate.rows, ...gate.bundleRows].filter((row) => row.failed);
    if (failedRows.length > 0) {
      for (const row of failedRows) {
        lines.push(
          `- ${row.name}: base ${row.base} head ${row.head} ratio ${row.ratio}`,
        );
      }
    }
  }
  return lines.join("\n");
}

if (process.argv[1] && process.argv[1].endsWith("summarize.js")) {
  const directory = resolve(process.argv[2] || "bench/ab/results");
  process.stdout.write(`${renderSummary(directory)}\n`);
}
