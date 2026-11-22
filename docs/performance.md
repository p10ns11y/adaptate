---
title: "Performance"
description: "Measured cost of import, a full document, four component views, a streaming check, and bundle size."
---

# Performance

CI compares a pull request with its base (`scripts/bench-compare.mjs`) and fails when any case is more than 5% slower (limit `1.05`). Cases: `transformSchema`, `transformPartialSchema`, `parsePartialJson`, `agUiStream`.

The [#53](https://github.com/p10ns11y/adaptate/pull/53) run reported:

| Case | Ratio (head / base) |
| --- | --- |
| `transformSchema` | 1.043 |
| `transformPartialSchema` | 1.002 |
| `parsePartialJson` | 0.989 |
| `agUiStream` | 0.996 |

[DESIGN.md](../DESIGN.md) estimates the traversal at O(N) time and O(D) space. That note is not a measured benchmark.

## A/B versus raw Zod

```mermaid
flowchart LR
  order[Grocery order JSON]
  deltas[TOOL_CALL_ARGS deltas]
  order --> A[A raw zod]
  order --> B[B zod plus adaptate]
  order --> C[C valibot]
  deltas --> A
  deltas --> B
  deltas --> C
  A --> node[Node 24]
  B --> node
  C --> node
  node --> gate[Gate head vs base, 5%]
  A --> recorded[Bun and Chromium]
  B --> recorded
  C --> recorded
```

One grocery order, three validators. [`agree.js`](../bench/ab/agree.js) checks they accept and reject the same fixtures, including every stream chunk, before a number is kept.

```sh
pnpm --filter @adaptate/core build && node bench/ab/run.js
```

| Row | What is timed |
| --- | --- |
| Full document | One `safeParse` of a schema built once. B is one `transformSchema` of the all-optional base plus `receiptConfig`. |
| Import | Module eval plus one full-document validation. Node and Bun: a fresh process per sample, one discarded warmup, then 31 samples. Chromium: a fresh page, no discarded warmup. The browser bundle includes this harness on every variant, so the B minus A import delta cancels it. Node and Bun import the package entry. |
| Bundle | esbuild, minify, tree-shaking. Full bundle, and a second bundle with `zod` external. `effect` is always external. |

Where the work is not the same:

- AG-UI: B appends the delta and resumes the partial-JSON scan from the previous chunk ([incremental scan](incremental-parser.md)), then `safeParse`s a lenient schema cached on the base schema when the value is new. A and C do not repair partial JSON. They need a complete value, so the chart marks them `no repair: needs complete JSON`. `repairMicros` clocks `parsePartialJson` on the growing buffer, without the check. That clock is the full-prefix oracle. It is recorded and is not gated.
- Parsed partial: the same value. B reuses one lenient schema per base schema (`WeakMap`) and `safeParse`s it. A and C reuse one static all-optional schema. The `ab-eval` gate names this row `adaptate cached partial us/chunk` and fails when head is more than 5% slower than base.
- `./standard` and `./effect` are bundle rows only. The timed app does not call the effect wrapper.
- Valibot uses its own schemas for the same accept/reject rules.
- `createStreamValidator.final()` is not the full-document row. The validator builds one `transformSchema` result per config when it is created and reuses it. A direct `transformSchema` call still builds a schema each time, which is what the full-document row does once, outside the timed loop.
- Four views per render: card, line items, delivery, and receipt. The schemas are built once. Each timed render parses the grocery order with all four. Zod and Valibot use static schemas for those fields. Adaptate calls `transformSchema` on one partial schema. The rate is renders per second (`viewsPerSec`). [`agree.js`](../bench/ab/agree.js) requires the full order to pass every view, and an empty object or a card-only object to fail. This row is recorded and is not gated. The README chart does not draw it.

The `ab-eval` job gates Node only, head build against the base commit, and fails above 5%: adaptate import median, full-document validations/sec, AG-UI µs/chunk, cached parsed-partial µs/chunk, and min plus gzip bytes for `.`, `./stream`, `./standard`, and `./effect` (full bundle and zod-external). Timings are interleaved and re-measured up to three times. Bundle bytes are not re-measured. Import p95, JSON repair, four views per render, heap after `node --expose-gc`, the raw-zod control rows, Bun, and Chromium are uploaded with the job summary and are not gated. A positive time in B vs A is slower. A negative validations/sec is slower.

On the same runner, the gate compared `233b1ef17f994088cc5687c0c5ea61ff7a7751a9` with the base commit (no schema cache). Parsed-partial went from 178.740 µs/chunk to 0.731 µs/chunk (ratio 0.004). AG-UI went from 206.137 µs/chunk to 20.571 µs/chunk (ratio 0.100). Full-document rate went from 3120065.726/s to 3263762.591/s (ratio 1.046). Import median went from 36.832 ms to 36.476 ms (ratio 0.990). The gate passed (limit 1.05).

The table below is one local `node bench/ab/run.js` of commit `ff4c7853d40090573172a56133911530c890fbcb` against raw Zod and Valibot. It is not the gate. The AG-UI row is the full push. For A and C that full push is the parsed-partial check, because they have no repair step. `repairMicros` is `parsePartialJson` on the growing buffer and is not that row.

Node v24.22.3, Bun 1.4.5, and Chromium 159.0.8154.6.

Workload: grocery order, 966 bytes, 41 `TOOL_CALL_ARGS` deltas of 24 characters. Import time includes module evaluation and one full-document validation. Node and Bun use a fresh process per sample, median and p95 of 31 samples after one discarded warmup. Chromium uses a fresh page per sample and no discarded warmup. Full-document and per-chunk rates are the median of 11 passes of 200 ms, one variant per process (Node, Bun) or page (Chromium). Node and Bun clocks are `process.hrtime.bigint`. The browser clock is `performance.now`.

| Metric | Runtime | A raw zod | B zod + adaptate | B vs A | C valibot |
| --- | --- | --- | --- | --- | --- |
| Import median (ms) | Node v24.22.3 | 39.612 | 39.499 | -0.113 ms (-0.286%) | 6.004 |
| Import p95 (ms) | Node v24.22.3 | 41.267 | 42.688 | +1.421 ms (+3.444%) | 6.582 |
| Full document (validations/sec) | Node v24.22.3 | 2,457,258 | 2,260,164 | -197,094 /s (-8.021%) | 487,754 |
| 4 views per render (renders/sec) | Node v24.22.3 | 1,174,399 | 488,050 | -686,349 /s (-58.443%) | 278,846 |
| AG-UI stream (µs/chunk) | Node v24.22.3 | 0.612 | 16.251 | +15.639 µs (+2554.077%) | 1.410 |
| JSON repair (µs/chunk) | Node v24.22.3 | no repair: needs complete JSON | 23.698 | n/a | no repair: needs complete JSON |
| Parsed partial check, cached schema (µs/chunk) | Node v24.22.3 | 0.612 | 0.834 | +0.221 µs (+36.148%) | 1.410 |
| Heap after GC (bytes) | Node v24.22.3 | 8,320,904 | 8,462,032 | 141,128 B (+1.696%) | 5,214,848 |
| Heap delta after GC (bytes) | Node v24.22.3 | 351,048 | 356,288 | 5,240 B (+1.493%) | 52,256 |
| Import median (ms) | Bun 1.4.5 | 22.148 | 23.330 | +1.182 ms (+5.338%) | 9.145 |
| Import p95 (ms) | Bun 1.4.5 | 23.504 | 24.508 | +1.004 ms (+4.270%) | 9.603 |
| Full document (validations/sec) | Bun 1.4.5 | 1,200,154 | 1,183,987 | -16,168 /s (-1.347%) | 1,370,945 |
| 4 views per render (renders/sec) | Bun 1.4.5 | 581,664 | 220,134 | -361,530 /s (-62.155%) | 404,246 |
| AG-UI stream (µs/chunk) | Bun 1.4.5 | 0.696 | 7.600 | +6.905 µs (+992.585%) | 1.331 |
| JSON repair (µs/chunk) | Bun 1.4.5 | no repair: needs complete JSON | 19.837 | n/a | no repair: needs complete JSON |
| Parsed partial check, cached schema (µs/chunk) | Bun 1.4.5 | 0.696 | 0.926 | +0.230 µs (+33.107%) | 1.331 |
| Heap after GC (bytes) | Bun 1.4.5 | 2,108,346 | 2,319,955 | 211,609 B (+10.037%) | 664,462 |
| Heap delta after GC (bytes) | Bun 1.4.5 | 605,941 | 646,320 | 40,379 B (+6.664%) | 118,306 |
| Import median (ms) | Chromium 159.0.8154.6 | 21.600 | 22.200 | +0.600 ms (+2.778%) | 4.800 |
| Import p95 (ms) | Chromium 159.0.8154.6 | 24.400 | 26.800 | +2.400 ms (+9.836%) | 6.700 |
| Full document (validations/sec) | Chromium 159.0.8154.6 | 2,411,025 | 1,840,655 | -570,370 /s (-23.657%) | 596,100 |
| 4 views per render (renders/sec) | Chromium 159.0.8154.6 | 1,175,320 | 303,155 | -872,165 /s (-74.207%) | 341,025 |
| AG-UI stream (µs/chunk) | Chromium 159.0.8154.6 | 0.716 | 16.107 | +15.391 µs (+2149.309%) | 1.064 |
| JSON repair (µs/chunk) | Chromium 159.0.8154.6 | no repair: needs complete JSON | 22.970 | n/a | no repair: needs complete JSON |
| Parsed partial check, cached schema (µs/chunk) | Chromium 159.0.8154.6 | 0.716 | 0.903 | +0.187 µs (+26.148%) | 1.064 |
| zod-only min / gzip (bytes) | esbuild 0.28.2 | 455,377 / 93,666 | — | — | baseline |
| `.` min / gzip | esbuild 0.28.2 | 455,377 / 93,666 | 456,345 / 93,976 | 968 / 310 B (+0.331% gzip) | — |
| `.` own min / gzip, zod external | esbuild 0.28.2 | — | 2,490 / 1,207 | +2,490 / +1,207 B | — |
| `./stream` min / gzip | esbuild 0.28.2 | 455,377 / 93,666 | 458,281 / 94,721 | 2,904 / 1,055 B (+1.126% gzip) | — |
| `./stream` own min / gzip, zod external | esbuild 0.28.2 | — | 4,397 / 1,999 | +4,397 / +1,999 B | — |
| `./standard` min / gzip | esbuild 0.28.2 | — | 589 / 328 | 589 / 328 B | — |
| `./standard` own min / gzip, zod external | esbuild 0.28.2 | — | 589 / 328 | +589 / +328 B | — |
| `./effect` min / gzip, effect external | esbuild 0.28.2 | 455,377 / 93,666 | 458,246 / 94,453 | 2,869 / 787 B (+0.840% gzip) | — |
| `./effect` own min / gzip, zod external, effect external | esbuild 0.28.2 | — | 4,340 / 1,790 | +4,340 / +1,790 B | — |

Characters passed to `JSON.parse` on that grocery order, 41 chunks: 68,714 across 130 parses. The bracket scan visits each new character once (966). A full rescan of the buffer was 68,304 character visits. [`scripts/render-perf-chart.mjs`](../scripts/render-perf-chart.mjs) reads [`assets/perf-run.json`](../assets/perf-run.json) and fails if a field is missing.
