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

The table below is one local `node bench/ab/run.js` of commit `233627cfaf8e67424ed612ec2320c7b1eb657742` against raw Zod and Valibot. It is not the gate. The AG-UI row is the full push. For A and C that full push is the parsed-partial check, because they have no repair step. `repairMicros` is `parsePartialJson` on the growing buffer and is not that row.

Node v24.22.3, Bun 1.4.5, and Chromium 159.0.8154.6.

Workload: grocery order, 966 bytes, 41 `TOOL_CALL_ARGS` deltas of 24 characters. Import time includes module evaluation and one full-document validation. Node and Bun use a fresh process per sample, median and p95 of 31 samples after one discarded warmup. Chromium uses a fresh page per sample and no discarded warmup. Full-document and per-chunk rates are the median of 11 passes of 200 ms, one variant per process (Node, Bun) or page (Chromium). Node and Bun clocks are `process.hrtime.bigint`. The browser clock is `performance.now`.

| Metric | Runtime | A raw zod | B zod + adaptate | B vs A | C valibot |
| --- | --- | --- | --- | --- | --- |
| Import median (ms) | Node v24.22.3 | 41.075 | 43.196 | +2.121 ms (+5.163%) | 6.329 |
| Import p95 (ms) | Node v24.22.3 | 46.119 | 49.500 | +3.381 ms (+7.331%) | 7.015 |
| Full document (validations/sec) | Node v24.22.3 | 2,482,969 | 2,248,814 | -234,155 /s (-9.430%) | 478,375 |
| 4 views per render (renders/sec) | Node v24.22.3 | 1,169,159 | 472,221 | -696,938 /s (-59.610%) | 267,328 |
| AG-UI stream (µs/chunk) | Node v24.22.3 | 0.623 | 17.240 | +16.616 µs (+2666.065%) | 1.410 |
| JSON repair (µs/chunk) | Node v24.22.3 | no repair: needs complete JSON | 24.096 | n/a | no repair: needs complete JSON |
| Parsed partial check, cached schema (µs/chunk) | Node v24.22.3 | 0.623 | 0.843 | +0.220 µs (+35.284%) | 1.410 |
| Heap after GC (bytes) | Node v24.22.3 | 8,312,992 | 8,461,992 | 149,000 B (+1.792%) | 5,213,360 |
| Heap delta after GC (bytes) | Node v24.22.3 | 351,048 | 356,288 | 5,240 B (+1.493%) | 50,768 |
| Import median (ms) | Bun 1.4.5 | 22.122 | 23.354 | +1.232 ms (+5.567%) | 9.129 |
| Import p95 (ms) | Bun 1.4.5 | 22.639 | 24.237 | +1.598 ms (+7.060%) | 9.545 |
| Full document (validations/sec) | Bun 1.4.5 | 1,208,839 | 1,168,329 | -40,510 /s (-3.351%) | 1,289,998 |
| 4 views per render (renders/sec) | Bun 1.4.5 | 592,448 | 220,692 | -371,756 /s (-62.749%) | 400,080 |
| AG-UI stream (µs/chunk) | Bun 1.4.5 | 0.699 | 7.768 | +7.070 µs (+1012.040%) | 1.316 |
| JSON repair (µs/chunk) | Bun 1.4.5 | no repair: needs complete JSON | 19.678 | n/a | no repair: needs complete JSON |
| Parsed partial check, cached schema (µs/chunk) | Bun 1.4.5 | 0.699 | 0.939 | +0.240 µs (+34.392%) | 1.316 |
| Heap after GC (bytes) | Bun 1.4.5 | 2,108,538 | 2,320,187 | 211,649 B (+10.038%) | 669,666 |
| Heap delta after GC (bytes) | Bun 1.4.5 | 606,037 | 647,984 | 41,947 B (+6.922%) | 122,235 |
| Import median (ms) | Chromium 159.0.8154.6 | 22.200 | 22.800 | +0.600 ms (+2.703%) | 4.800 |
| Import p95 (ms) | Chromium 159.0.8154.6 | 25.500 | 27.000 | +1.500 ms (+5.882%) | 6.900 |
| Full document (validations/sec) | Chromium 159.0.8154.6 | 2,381,765 | 1,828,805 | -552,960 /s (-23.216%) | 595,220 |
| 4 views per render (renders/sec) | Chromium 159.0.8154.6 | 1,161,290 | 302,790 | -858,500 /s (-73.926%) | 342,155 |
| AG-UI stream (µs/chunk) | Chromium 159.0.8154.6 | 0.709 | 17.254 | +16.545 µs (+2332.112%) | 1.077 |
| JSON repair (µs/chunk) | Chromium 159.0.8154.6 | no repair: needs complete JSON | 22.959 | n/a | no repair: needs complete JSON |
| Parsed partial check, cached schema (µs/chunk) | Chromium 159.0.8154.6 | 0.709 | 0.893 | +0.183 µs (+25.842%) | 1.077 |
| zod-only min / gzip (bytes) | esbuild 0.28.2 | 455,377 / 93,666 | — | — | baseline |
| `.` min / gzip | esbuild 0.28.2 | 455,377 / 93,666 | 456,345 / 93,976 | 968 / 310 B (+0.331% gzip) | — |
| `.` own min / gzip, zod external | esbuild 0.28.2 | — | 2,490 / 1,207 | +2,490 / +1,207 B | — |
| `./stream` min / gzip | esbuild 0.28.2 | 455,377 / 93,666 | 458,281 / 94,721 | 2,904 / 1,055 B (+1.126% gzip) | — |
| `./stream` own min / gzip, zod external | esbuild 0.28.2 | — | 4,397 / 1,999 | +4,397 / +1,999 B | — |
| `./standard` min / gzip | esbuild 0.28.2 | — | 589 / 328 | 589 / 328 B | — |
| `./standard` own min / gzip, zod external | esbuild 0.28.2 | — | 589 / 328 | +589 / +328 B | — |
| `./effect` min / gzip, effect external | esbuild 0.28.2 | 455,377 / 93,666 | 458,246 / 94,453 | 2,869 / 787 B (+0.840% gzip) | — |
| `./effect` own min / gzip, zod external, effect external | esbuild 0.28.2 | — | 4,340 / 1,789 | +4,340 / +1,789 B | — |

Character visits on that grocery order, 41 chunks: 68,304 with a full rescan of the buffer each chunk, 966 when each character is scanned once. [`scripts/render-perf-chart.mjs`](../scripts/render-perf-chart.mjs) reads [`assets/perf-run.json`](../assets/perf-run.json) and fails if a field is missing.
