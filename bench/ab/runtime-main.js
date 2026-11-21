import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  coldSampleCount,
  heapTrials,
  heapValidations,
  reportBudgetMs,
  reportRounds,
} from "./config.js";
import { spawnColdMs } from "./cold.js";
import { libraryHref } from "./load.js";
import {
  encodePartials,
  orderDocument,
  partialsForDeltas,
  toolCallDeltas,
} from "./order.js";
import { median, percentile } from "./stats.js";

const benchDir = dirname(fileURLToPath(import.meta.url));
const names = ["zod", "adaptate", "valibot"];
const heapChild = fileURLToPath(new URL("./heap-child.js", import.meta.url));
const rateChild = fileURLToPath(new URL("./rate-child.js", import.meta.url));

function heapOnce(variant, partialsPath, prefix) {
  const result = spawnSync(process.execPath, [...prefix, heapChild], {
    cwd: benchDir,
    env: {
      ...process.env,
      AB_VARIANT: variant,
      AB_PARTIALS: partialsPath,
      AB_ROOT: "",
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${variant} heap failed`);
  }
  return JSON.parse(result.stdout);
}

function measureHeap(variant, partialsPath) {
  let prefix = process.versions.bun ? [] : ["--expose-gc"];
  let probe = heapOnce(variant, partialsPath, prefix);
  if (!probe.available && process.versions.bun) {
    prefix = ["--expose-gc"];
    probe = heapOnce(variant, partialsPath, prefix);
  }
  if (!probe.available) {
    return { heapAfterBytes: null, heapDeltaBytes: null, collector: null };
  }
  const afterSamples = [probe.after];
  const deltaSamples = [probe.delta];
  if (probe.checksum < heapValidations) {
    throw new Error(`${variant} heap checksum ${probe.checksum}`);
  }
  for (let trial = 1; trial < heapTrials; trial += 1) {
    const payload = heapOnce(variant, partialsPath, prefix);
    if (!payload.available) {
      return { heapAfterBytes: null, heapDeltaBytes: null, collector: null };
    }
    if (payload.checksum < heapValidations) {
      throw new Error(`${variant} heap checksum ${payload.checksum}`);
    }
    afterSamples.push(payload.after);
    deltaSamples.push(payload.delta);
  }
  return {
    heapAfterBytes: median(afterSamples),
    heapDeltaBytes: median(deltaSamples),
    collector: probe.collector,
  };
}

const stream = await import(libraryHref("", "@adaptate/core/stream"));
const workload = toolCallDeltas(orderDocument);
const partials = partialsForDeltas(workload.deltas, stream.parsePartialJson);
const partialsPath = resolve(benchDir, "results", "partials.json");
mkdirSync(dirname(partialsPath), { recursive: true });
writeFileSync(partialsPath, JSON.stringify(encodePartials(partials)));

console.error(`cold warmup ${process.versions.bun ? "bun" : "node"}`);
for (const name of names) spawnColdMs(process.execPath, name, "");
const cold = Object.fromEntries(names.map((name) => [name, []]));
for (let sample = 0; sample < coldSampleCount; sample += 1) {
  const order = sample % 2 === 0 ? names : [...names].reverse();
  for (const name of order) cold[name].push(spawnColdMs(process.execPath, name, ""));
  if (sample % 10 === 0) console.error(`cold sample ${sample}`);
}

console.error("rates");
const rates = {};
for (const name of names) {
  const result = spawnSync(process.execPath, [rateChild], {
    cwd: benchDir,
    env: {
      ...process.env,
      AB_VARIANT: name,
      AB_PARTIALS: partialsPath,
      AB_ROOT: "",
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${name} rate failed`);
  }
  rates[name] = JSON.parse(result.stdout);
  console.error(`rate ${name} ${Math.round(rates[name].validationsPerSec)}`);
}

console.error("heap");
const heap = {};
for (const name of names) {
  heap[name] = measureHeap(name, partialsPath);
  console.error(`heap ${name} ${heap[name].heapAfterBytes}`);
}

const variants = {};
for (const name of names) {
  variants[name] = {
    coldMedianMs: median(cold[name]),
    coldP95Ms: percentile(cold[name], 0.95),
    validationsPerSec: rates[name].validationsPerSec,
    viewsPerSec: rates[name].viewsPerSec,
    agUiMicros: rates[name].agUiMicros,
    partialMicros: rates[name].partialMicros,
    repairMicros: rates[name].repairMicros,
    heapAfterBytes: heap[name].heapAfterBytes,
    heapDeltaBytes: heap[name].heapDeltaBytes,
    heapCollector: heap[name].collector,
  };
}

process.stdout.write(
  JSON.stringify({
    runtime: process.versions.bun ? "bun" : "node",
    runtimeVersion: process.versions.bun ?? process.version,
    coldSamples: coldSampleCount,
    rounds: reportRounds,
    budgetMs: reportBudgetMs,
    heapTrials,
    heapValidations,
    documentBytes: workload.bytes,
    chunkCount: workload.deltas.length,
    variants,
  }),
);
