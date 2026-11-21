# A/B runtime eval

Method and results: [docs/performance.md](../../docs/performance.md).

`viewsPerSec` is one render of the grocery order through four schemas built once: card, line items, delivery, and receipt. Zod and Valibot use four static schemas for those fields. Adaptate uses `transformSchema` on one partial schema.

```sh
pnpm --filter @adaptate/core build && node bench/ab/run.js
```

Gate, from the repo root, after both checkouts are built: `node bench/ab/compare.js <base checkout> . 1.05`
