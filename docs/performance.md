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

- AG-UI: B appends the delta, repairs JSON from the previous chunk ([incremental scan](incremental-parser.md)), then `safeParse`s a lenient schema cached on the base schema when the value is new. A and C `safeParse` a partial that was already parsed. For A and C that number is the parsed-partial number. JSON repair is the AG-UI row minus the parsed-partial row. That difference is two medians, not a separate clock, and it is not gated.
- Parsed partial: the same value. B reuses one lenient schema per base schema (`WeakMap`) and `safeParse`s it. A and C reuse one static all-optional schema. The `ab-eval` gate names this row `adaptate cached partial us/chunk` and fails when head is more than 5% slower than base.
- `./standard` and `./effect` are bundle rows only. The timed app does not call the effect wrapper.
- Valibot uses its own schemas for the same accept/reject rules.
- `createStreamValidator.final()` is not the full-document row. The validator builds one `transformSchema` result per config when it is created and reuses it. A direct `transformSchema` call still builds a schema each time, which is what the full-document row does once, outside the timed loop.

The `ab-eval` job gates Node only, head build against the base commit, and fails above 5%: adaptate import median, full-document validations/sec, AG-UI µs/chunk, cached parsed-partial µs/chunk, and min plus gzip bytes for `.`, `./stream`, `./standard`, and `./effect` (full bundle and zod-external). Timings are interleaved and re-measured up to three times. Bundle bytes are not re-measured. Import p95, heap after `node --expose-gc`, the raw-zod control rows, Bun, and Chromium are uploaded with the job summary and are not gated. A positive time in B vs A is slower. A negative validations/sec is slower.

On the same runner, the gate compared `233b1ef17f994088cc5687c0c5ea61ff7a7751a9` with the base commit (no schema cache). Parsed-partial went from 178.740 µs/chunk to 0.731 µs/chunk (ratio 0.004). AG-UI went from 206.137 µs/chunk to 20.571 µs/chunk (ratio 0.100). Full-document rate went from 3120065.726/s to 3263762.591/s (ratio 1.046). Import median went from 36.832 ms to 36.476 ms (ratio 0.990). The gate passed (limit 1.05).

The table below is one local `node bench/ab/run.js` of this tree against raw Zod and Valibot. It is not the gate. JSON repair on Node is the AG-UI median minus the parsed-partial median, 17.137 − 0.840 = 16.297 µs/chunk. That is two medians, not a separate clock.

Node v24.22.3, Bun 1.4.5, and Chromium 159.0.8154.6.

Workload: grocery order, 966 bytes, 41 `TOOL_CALL_ARGS` deltas of 24 characters. Import time includes module evaluation and one full-document validation. Node and Bun use a fresh process per sample, median and p95 of 31 samples after one discarded warmup. Chromium uses a fresh page per sample and no discarded warmup. Full-document and per-chunk rates are the median of 11 passes of 200 ms, one variant per process (Node, Bun) or page (Chromium). Node and Bun clocks are `process.hrtime.bigint`. The browser clock is `performance.now`.

| Metric | Runtime | A raw zod | B zod + adaptate | B vs A | C valibot |
| --- | --- | --- | --- | --- | --- |
| Import median (ms) | Node v24.22.3 | 39.542 | 41.353 | +1.811 ms (+4.580%) | 6.031 |
| Import p95 (ms) | Node v24.22.3 | 41.034 | 42.943 | +1.909 ms (+4.652%) | 6.572 |
| Full document (validations/sec) | Node v24.22.3 | 2,455,728 | 2,294,074 | -161,654 /s (-6.583%) | 480,429 |
| AG-UI stream (µs/chunk) | Node v24.22.3 | 0.605 | 17.137 | +16.532 µs (+2732.887%) | 1.407 |
| Parsed partial check, cached schema (µs/chunk) | Node v24.22.3 | 0.605 | 0.840 | +0.236 µs (+38.938%) | 1.407 |
| Heap after GC (bytes) | Node v24.22.3 | 8,293,200 | 8,426,872 | 133,672 B (+1.612%) | 5,204,232 |
| Heap delta after GC (bytes) | Node v24.22.3 | 356,008 | 355,352 | -656 B (-0.184%) | 52,040 |
| Import median (ms) | Bun 1.4.5 | 22.385 | 23.249 | +0.864 ms (+3.860%) | 9.019 |
| Import p95 (ms) | Bun 1.4.5 | 23.941 | 23.986 | +0.045 ms (+0.188%) | 12.069 |
| Full document (validations/sec) | Bun 1.4.5 | 1,217,320 | 1,202,015 | -15,305 /s (-1.257%) | 1,369,493 |
| AG-UI stream (µs/chunk) | Bun 1.4.5 | 0.707 | 7.239 | +6.531 µs (+923.232%) | 1.313 |
| Parsed partial check, cached schema (µs/chunk) | Bun 1.4.5 | 0.707 | 0.822 | +0.115 µs (+16.255%) | 1.313 |
| Heap after GC (bytes) | Bun 1.4.5 | 2,078,975 | 2,271,444 | 192,469 B (+9.258%) | 657,404 |
| Heap delta after GC (bytes) | Bun 1.4.5 | 603,685 | 667,658 | 63,973 B (+10.597%) | 118,085 |
| Import median (ms) | Chromium 159.0.8154.6 | 21.900 | 22.500 | +0.600 ms (+2.740%) | 4.800 |
| Import p95 (ms) | Chromium 159.0.8154.6 | 28.600 | 31.300 | +2.700 ms (+9.441%) | 13.300 |
| Full document (validations/sec) | Chromium 159.0.8154.6 | 2,189,715 | 1,871,090 | -318,625 /s (-14.551%) | 598,285 |
| AG-UI stream (µs/chunk) | Chromium 159.0.8154.6 | 0.726 | 16.034 | +15.308 µs (+2109.773%) | 1.052 |
| Parsed partial check, cached schema (µs/chunk) | Chromium 159.0.8154.6 | 0.726 | 0.852 | +0.126 µs (+17.432%) | 1.052 |
| zod-only min / gzip (bytes) | esbuild 0.28.2 | 455,377 / 93,666 | — | — | baseline |
| `.` min / gzip | esbuild 0.28.2 | 455,377 / 93,666 | 456,345 / 93,976 | 968 / 310 B (+0.331% gzip) | — |
| `.` own min / gzip, zod external | esbuild 0.28.2 | — | 2,490 / 1,207 | +2,490 / +1,207 B | — |
| `./stream` min / gzip | esbuild 0.28.2 | 455,377 / 93,666 | 458,281 / 94,721 | 2,904 / 1,055 B (+1.126% gzip) | — |
| `./stream` own min / gzip, zod external | esbuild 0.28.2 | — | 4,397 / 1,999 | +4,397 / +1,999 B | — |
| `./standard` min / gzip | esbuild 0.28.2 | — | 589 / 328 | 589 / 328 B | — |
| `./standard` own min / gzip, zod external | esbuild 0.28.2 | — | 589 / 328 | +589 / +328 B | — |
| `./effect` min / gzip, effect external | esbuild 0.28.2 | 455,377 / 93,666 | 458,246 / 94,453 | 2,869 / 787 B (+0.840% gzip) | — |
| `./effect` own min / gzip, zod external, effect external | esbuild 0.28.2 | — | 4,340 / 1,789 | +4,340 / +1,789 B | — |

Character visits on that grocery order, 41 chunks: 68,304 with a full rescan of the buffer each chunk, 966 when each character is scanned once.
