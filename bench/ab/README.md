# A/B runtime eval

Method and results: [docs/performance.md](../../docs/performance.md).

```sh
pnpm --filter @adaptate/core build && node bench/ab/run.js
```

Gate, from the repo root, after both checkouts are built: `node bench/ab/compare.js <base checkout> . 1.05`
