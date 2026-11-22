import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { nodeNowNs } from "./clock.js";
import {
  gateBudgetMs,
  gateColdSamples,
  gateLimit,
  gateRounds,
  streamIncrementalBaseline,
} from "./config.js";
import { spawnColdMs } from "./cold.js";
import { measureBundles } from "./bundle.js";
import { createApps } from "./measure.js";
import { orderDocument, partialsForDeltas, toolCallDeltas } from "./order.js";
import { measureOnce } from "./sample.js";
import { median } from "./stats.js";

const benchDir = dirname(fileURLToPath(import.meta.url));
const [baseArg, headArg, limitArg] = process.argv.slice(2);
const baseRoot = resolve(process.cwd(), baseArg || "");
const headRoot = resolve(process.cwd(), headArg || ".");
const limit = Number(limitArg || String(gateLimit));

function worse(base, head, higherIsWorse) {
  if (!(base > 0) || !(head > 0)) return true;
  if (higherIsWorse) return head / base > limit;
  return base / head > limit;
}

function pair(measureBase, measureHead) {
  measureBase();
  measureHead();
  const baseSamples = [];
  const headSamples = [];
  for (let round = 0; round < gateRounds; round += 1) {
    const headFirst = round % 2 === 0;
    const first = headFirst ? measureHead : measureBase;
    const second = headFirst ? measureBase : measureHead;
    const firstValue = first();
    const secondValue = second();
    if (headFirst) {
      headSamples.push(firstValue);
      baseSamples.push(secondValue);
    } else {
      baseSamples.push(firstValue);
      headSamples.push(secondValue);
    }
  }
  return { base: median(baseSamples), head: median(headSamples) };
}

function judge(name, measure, higherIsWorse, gated) {
  let result = measure();
  let attempts = 1;
  while (gated && attempts < 3 && worse(result.base, result.head, higherIsWorse)) {
    console.error(`re-measure ${name} attempt ${attempts + 1}`);
    result = measure();
    attempts += 1;
  }
  const ratio = result.head / result.base;
  const failed = gated && worse(result.base, result.head, higherIsWorse);
  return {
    name,
    base: result.base,
    head: result.head,
    ratio,
    attempts,
    higherIsWorse,
    gated,
    failed,
  };
}

function coldPair(variant) {
  spawnColdMs(process.execPath, variant, baseRoot);
  spawnColdMs(process.execPath, variant, headRoot);
  const baseSamples = [];
  const headSamples = [];
  for (let sample = 0; sample < gateColdSamples; sample += 1) {
    const headFirst = sample % 2 === 0;
    const firstRoot = headFirst ? headRoot : baseRoot;
    const secondRoot = headFirst ? baseRoot : headRoot;
    const first = spawnColdMs(process.execPath, variant, firstRoot);
    const second = spawnColdMs(process.execPath, variant, secondRoot);
    if (headFirst) {
      headSamples.push(first);
      baseSamples.push(second);
    } else {
      baseSamples.push(first);
      headSamples.push(second);
    }
  }
  return { base: median(baseSamples), head: median(headSamples) };
}

console.error("load builds");
const baseApps = await createApps(baseRoot);
const headApps = await createApps(headRoot);
const workload = toolCallDeltas(orderDocument);
const basePartials = partialsForDeltas(workload.deltas, baseApps.parsePartialJson);
const headPartials = partialsForDeltas(workload.deltas, headApps.parsePartialJson);

const rows = [];
console.error("cold");
rows.push(
  judge("adaptate cold median ms", () => coldPair("adaptate"), true, true),
);
rows.push(judge("zod cold median ms", () => coldPair("zod"), true, false));

console.error("full document");
rows.push(
  judge(
    "adaptate validations/sec",
    () =>
      pair(
        () =>
          measureOnce(
            baseApps.adaptate,
            workload.deltas,
            basePartials,
            gateBudgetMs,
            nodeNowNs,
            "rate",
          ).validationsPerSec,
        () =>
          measureOnce(
            headApps.adaptate,
            workload.deltas,
            headPartials,
            gateBudgetMs,
            nodeNowNs,
            "rate",
          ).validationsPerSec,
      ),
    false,
    true,
  ),
);
rows.push(
  judge(
    "zod validations/sec",
    () =>
      pair(
        () =>
          measureOnce(
            baseApps.zod,
            workload.deltas,
            basePartials,
            gateBudgetMs,
            nodeNowNs,
            "rate",
          ).validationsPerSec,
        () =>
          measureOnce(
            headApps.zod,
            workload.deltas,
            headPartials,
            gateBudgetMs,
            nodeNowNs,
            "rate",
          ).validationsPerSec,
      ),
    false,
    false,
  ),
);

console.error("views");
rows.push(
  judge(
    "adaptate views/sec",
    () =>
      pair(
        () =>
          measureOnce(
            baseApps.adaptate,
            workload.deltas,
            basePartials,
            gateBudgetMs,
            nodeNowNs,
            "views",
          ).viewsPerSec,
        () =>
          measureOnce(
            headApps.adaptate,
            workload.deltas,
            headPartials,
            gateBudgetMs,
            nodeNowNs,
            "views",
          ).viewsPerSec,
      ),
    false,
    false,
  ),
);

console.error("stream");
rows.push(
  judge(
    "adaptate ag-ui us/chunk",
    () =>
      pair(
        () =>
          measureOnce(
            baseApps.adaptate,
            workload.deltas,
            basePartials,
            gateBudgetMs,
            nodeNowNs,
            "agui",
          ).agUiMicros,
        () =>
          measureOnce(
            headApps.adaptate,
            workload.deltas,
            headPartials,
            gateBudgetMs,
            nodeNowNs,
            "agui",
          ).agUiMicros,
      ),
    true,
    true,
  ),
);
rows.push(
  judge(
    "adaptate cached partial us/chunk",
    () =>
      pair(
        () =>
          measureOnce(
            baseApps.adaptate,
            workload.deltas,
            basePartials,
            gateBudgetMs,
            nodeNowNs,
            "partial",
          ).partialMicros,
        () =>
          measureOnce(
            headApps.adaptate,
            workload.deltas,
            headPartials,
            gateBudgetMs,
            nodeNowNs,
            "partial",
          ).partialMicros,
      ),
    true,
    true,
  ),
);

console.error("bundles");
const baseBundles = await measureBundles(baseRoot);
const headBundles = await measureBundles(headRoot);
const bundleRows = [];
for (const headEntry of headBundles.entries) {
  const baseEntry =
    baseBundles.entries.find((entry) => entry.id === headEntry.id) ??
    (headEntry.id === "./stream-incremental"
      ? { id: headEntry.id, ...streamIncrementalBaseline }
      : undefined);
  if (!baseEntry) throw new Error(`base is missing bundle ${headEntry.id}`);
  for (const field of ["full", "own"]) {
    for (const unit of ["minBytes", "gzipBytes"]) {
      const base = baseEntry[field][unit];
      const head = headEntry[field][unit];
      const ratio = head / base;
      const failed = ratio > limit;
      bundleRows.push({
        name: `${headEntry.id} ${field} ${unit}`,
        base,
        head,
        ratio,
        attempts: 1,
        higherIsWorse: true,
        gated: true,
        failed,
      });
    }
  }
}

const failed = [...rows, ...bundleRows].some((row) => row.failed);
const report = {
  limit,
  baseRoot,
  headRoot,
  rows,
  bundleRows,
  failed,
};
const outDir = resolve(benchDir, "results");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "gate.json"), JSON.stringify(report, null, 2));
console.table(
  [...rows, ...bundleRows].map((row) => ({
    case: row.name,
    base: typeof row.base === "number" ? row.base.toFixed(3) : row.base,
    head: typeof row.head === "number" ? row.head.toFixed(3) : row.head,
    ratio: row.ratio.toFixed(3),
    attempts: row.attempts,
    gated: row.gated,
    result: row.failed ? "FAIL" : "ok",
  })),
);
console.log(
  failed
    ? `FAIL: a gated Node metric or bundle is more than ${((limit - 1) * 100).toFixed(0)}% worse`
    : "PASS",
);
process.exit(failed ? 1 : 0);
