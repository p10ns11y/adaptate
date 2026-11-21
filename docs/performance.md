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

- AG-UI: B appends the delta, repairs JSON, builds a schema, then `safeParse`s. A and C `safeParse` a partial that was already parsed. For A and C that number is the parsed-partial number.
- Parsed partial: the same value. B builds a Zod schema on every call. A and C reuse one static all-optional schema.
- `./standard` and `./effect` are bundle rows only. The timed app does not call the effect wrapper.
- Valibot uses its own schemas for the same accept/reject rules.
- `createStreamValidator.final()` is not the full-document row. It rebuilds a schema per document.

The `ab-eval` job gates Node only, head build against the base commit, and fails above 5%: adaptate import median, full-document validations/sec, AG-UI µs/chunk, parsed-partial µs/chunk, and min plus gzip bytes for `.`, `./stream`, `./standard`, and `./effect` (full bundle and zod-external). Timings are interleaved and re-measured up to three times. Bundle bytes are not re-measured. Import p95, heap after `node --expose-gc`, the raw-zod control rows, Bun, and Chromium are uploaded with the job summary and are not gated. A positive time in B vs A is slower. A negative validations/sec is slower.

Node 24.22.3, Bun 1.4.5, and Chromium 159.0.8154.6 on `10a7b5b3ff11df008c144b128eba4e298bd9c0a6`, job [ab-eval](https://github.com/p10ns11y/adaptate/actions/runs/44951463938), artifact `ab-eval-results`.

Workload: grocery order, 966 bytes, 41 `TOOL_CALL_ARGS` deltas of 24 characters. Import time includes module evaluation and one full-document validation. Node and Bun use a fresh process per sample, median and p95 of 31 samples after one discarded warmup. Chromium uses a fresh page per sample and no discarded warmup. Full-document and per-chunk rates are the median of 11 passes of 200 ms, one variant per process (Node, Bun) or page (Chromium). Node and Bun clocks are `process.hrtime.bigint`. The browser clock is `performance.now`.

| Metric | Runtime | A raw zod | B zod + adaptate | B vs A | C valibot |
| --- | --- | --- | --- | --- | --- |
| Import median (ms) | Node v24.22.3 | 50.421 | 52.992 | +2.571 ms (+5.099%) | 6.883 |
| Import p95 (ms) | Node v24.22.3 | 51.708 | 53.953 | +2.245 ms (+4.342%) | 7.130 |
| Full document (validations/sec) | Node v24.22.3 | 2,158,691 | 2,025,911 | -132,780 /s (-6.151%) | 424,844 |
| AG-UI stream (µs/chunk) | Node v24.22.3 | 0.663 | 288.979 | +288.316 µs (+43467.689%) | 1.564 |
| Parsed partial check (µs/chunk) | Node v24.22.3 | 0.663 | 272.188 | +271.525 µs (+40936.264%) | 1.564 |
| Heap after GC (bytes) | Node v24.22.3 | 8,292,208 | 8,573,160 | 280,952 B (+3.388%) | 5,205,240 |
| Heap delta after GC (bytes) | Node v24.22.3 | 356,520 | 524,096 | 167,576 B (+47.003%) | 52,024 |
| Import median (ms) | Bun 1.4.5 | 27.716 | 28.636 | +0.920 ms (+3.319%) | 12.093 |
| Import p95 (ms) | Bun 1.4.5 | 32.376 | 32.954 | +0.578 ms (+1.785%) | 12.551 |
| Full document (validations/sec) | Bun 1.4.5 | 1,040,901 | 1,040,525 | -376 /s (-0.036%) | 1,194,421 |
| AG-UI stream (µs/chunk) | Bun 1.4.5 | 0.803 | 327.797 | +326.993 µs (+40706.549%) | 1.333 |
| Parsed partial check (µs/chunk) | Bun 1.4.5 | 0.803 | 268.917 | +268.113 µs (+33376.733%) | 1.333 |
| Heap after GC (bytes) | Bun 1.4.5 | 2,086,861 | 2,361,609 | 274,748 B (+13.166%) | 669,022 |
| Heap delta after GC (bytes) | Bun 1.4.5 | 603,653 | 795,561 | 191,908 B (+31.791%) | 119,705 |
| Import median (ms) | Chromium 159.0.8154.6 | 29.200 | 30.600 | +1.400 ms (+4.795%) | 7.400 |
| Import p95 (ms) | Chromium 159.0.8154.6 | 32.800 | 33.000 | +0.200 ms (+0.610%) | 15.200 |
| Full document (validations/sec) | Chromium 159.0.8154.6 | 2,035,655 | 1,916,610 | -119,045 /s (-5.848%) | 449,225 |
| AG-UI stream (µs/chunk) | Chromium 159.0.8154.6 | 0.833 | 195.902 | +195.069 µs (+23413.680%) | 1.334 |
| Parsed partial check (µs/chunk) | Chromium 159.0.8154.6 | 0.833 | 180.939 | +180.106 µs (+21617.713%) | 1.334 |
| zod-only min / gzip (bytes) | esbuild 0.28.2 | 455,377 / 93,666 | — | — | baseline |
| `.` min / gzip | esbuild 0.28.2 | 455,377 / 93,666 | 456,345 / 93,976 | 968 / 310 B (+0.331% gzip) | — |
| `.` own min / gzip, zod external | esbuild 0.28.2 | — | 2,490 / 1,207 | +2,490 / +1,207 B | — |
| `./stream` min / gzip | esbuild 0.28.2 | 455,377 / 93,666 | 458,189 / 94,590 | 2,812 / 924 B (+0.986% gzip) | — |
| `./stream` own min / gzip, zod external | esbuild 0.28.2 | — | 4,303 / 1,900 | +4,303 / +1,900 B | — |
| `./standard` min / gzip | esbuild 0.28.2 | — | 589 / 328 | 589 / 328 B | — |
| `./standard` own min / gzip, zod external | esbuild 0.28.2 | — | 589 / 328 | +589 / +328 B | — |
| `./effect` min / gzip, effect external | esbuild 0.28.2 | 455,377 / 93,666 | 458,189 / 94,307 | 2,812 / 641 B (+0.684% gzip) | — |
| `./effect` own min / gzip, zod external, effect external | esbuild 0.28.2 | — | 4,280 / 1,681 | +4,280 / +1,681 B | — |

Gate on that run: PASS (limit 1.05).
