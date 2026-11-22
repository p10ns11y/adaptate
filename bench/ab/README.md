# A/B runtime eval

`viewsPerSec` is one render of the grocery order through four schemas built once: card, line items, delivery, and receipt. Zod and Valibot use four static schemas for those fields. Adaptate uses `transformSchema` on one partial schema.

`repairMicros` times `parsePartialJson` on the growing AG-UI buffer, without the partial check. Zod and Valibot have no repair step. The row is recorded and is not gated.

```sh
pnpm --filter @adaptate/core build && node bench/ab/run.js
```

Gate, from the repo root, after both checkouts are built: `node bench/ab/compare.js <base checkout> . 1.05`
