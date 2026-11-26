---
title: "Proof"
description: "Each front-page sentence mapped to a test, a script, or a CI job."
answer: "Each claim on the root README maps to a test, a script, or a CI job in this repository. This page lists the sentence and the proof that covers it."
faq:
  - question: "Where are the deep-input tests?"
    answer: "packages/core/src/__tests__/deep-nesting.test.ts and packages/utils/src/__tests__/deep-nesting.test.ts cover 100,000-level walks and the 500-level $ref cap."
  - question: "Where are the README snippets tested?"
    answer: "packages/core/src/__tests__/index.test.ts and packages/utils/src/__tests__/openapi.test.ts run the README snippets as shown."
---

# Proof

Each sentence on the front page maps to something in the repo.

| Sentence | Proof |
| --- | --- |
| Partial documents fail a full schema, and deep input overflows a recursive walk | The rows below. `JSON.parse` throws on a cut-off tool call. The deep walks covered here keep their frames in an ordinary stack |
| 100,000 levels. Streamed JSON, including a missing last character | [`reads streamed JSON one hundred thousand levels deep`](../packages/core/src/__tests__/deep-nesting.test.ts) expects the leaf `1` from `createPartialJsonFeed`, `reparseFeed`, `parsePartialJson`, and `parsePartialJson` of the text with the last character removed |
| 100,000 levels. OpenAPI to Zod, Zod to OpenAPI, and a local `$ref` document | [`converts an OpenAPI schema one hundred thousand levels deep`](../packages/utils/src/__tests__/deep-nesting.test.ts), [`converts a Zod schema one hundred thousand levels deep`](../packages/utils/src/__tests__/deep-nesting.test.ts), and [`dereferences a document one hundred thousand levels deep`](../packages/utils/src/__tests__/deep-nesting.test.ts) |
| Under 3 seconds. One `$ref` at each of those 100,000 levels | [`resolves one ref at each of one hundred thousand levels`](../packages/utils/src/__tests__/deep-nesting.test.ts) expects `performance.now()` around `dereferenceLocalDocument` to be under `3_000` |
| `RangeError` past 500. A nested `$ref` chain stops at depth 500 | That same file builds a 2,000-link chain and expects `RangeError` matching `Maximum dereference depth (500)`. [`resolves a local pointer chain and rejects nested refs past 500`](../packages/utils/src/__tests__/dereference-local.test.ts) expects the same error for a chain of 501 |
| `JSON.parse` throws `SyntaxError`. `check.partial` is `{ title: "Pas" }`. `check.results.card.valid` is `true` | [`readme snippets`](../packages/core/src/__tests__/index.test.ts). The same partial shape is covered for a shorter cut in [`stream.test.ts`](../packages/core/src/__tests__/stream.test.ts) |
| The same partial reader returns the leaf of a 100,000-level document with the last character missing | The streamed-JSON case above, `parsePartialJson(text.slice(0, -1))` |
| Streams partial JSON without re-reading what it already saw | Partial JSON tests assert `visits` equals the text length ([`partial-json.property.test.ts`](../packages/core/src/__tests__/partial-json.property.test.ts), [`stream.test.ts`](../packages/core/src/__tests__/stream.test.ts)). The recorded run is [Measured](performance.md#measured) |
| `{ title: "Pas" }` passes that card. The same schema with `servings: true` rejects it | [`readme snippets`](../packages/core/src/__tests__/index.test.ts). [examples/react-view](../examples/react-view) renders the card and the kitchen |
| Three deltas give `{ title: "Pa" }`, `{ title: "Pasta" }`, `{ title: "Pasta", servings: 2 }`. `final({ title: "Pasta" })` passes the card and not the kitchen | [`readme snippets`](../packages/core/src/__tests__/index.test.ts) `streams three deltas and reports per-view readiness from final` |
| Nested fields, `"*"` array items, `satisfies Config<T>`, and `requiredIf` | [`readme snippets`](../packages/core/src/__tests__/index.test.ts) `checks nested, array, and conditional configs` |
| OpenAPI to Zod and back keeps `required` | [`readme snippets`](../packages/utils/src/__tests__/openapi.test.ts) `converts an OpenAPI schema to Zod and back` |
| `fromAsyncIterable` reads bytes from a Node `Readable` | [`readme snippets`](../packages/core/src/__tests__/index.test.ts) `reads bytes from a Node Readable incrementally` |
| A transformed Zod schema works through `@adaptate/core/standard` | [`readme snippets`](../packages/core/src/__tests__/index.test.ts) `validates transformed Zod schemas as Standard Schemas`, and [`standard.test.ts`](../packages/core/src/__tests__/standard.test.ts) |
| `createEffectStreamValidator(...).final(text)` reports each view | [`readme snippets`](../packages/core/src/__tests__/index.test.ts) `reports views from the Effect validator`, and [`effect.test.ts`](../packages/core/src/__tests__/effect.test.ts) |
| A circular schema passed to either converter throws `RangeError` | [`openapi.test.ts`](../packages/utils/src/__tests__/openapi.test.ts) `throws when a dereferenced schema points at an ancestor` and `throws when an object getter refers to its own schema` |
| Two performance checks fail a pull request more than 5% slower or larger than its base | [`bench` and `ab-eval`](../.github/workflows/ci.yml). Numbers in [Performance](performance.md) |
| Types ship in the package. CI checks the packed tarballs on TypeScript 7 and 6, for `bundler`, `node16`, and `nodenext` | [`@adaptate/core` publishes `types`](../packages/core/package.json). [`ts7-consumer`](../.github/workflows/ci.yml) runs [`ts-consumer-check.mjs`](../scripts/ts-consumer-check.mjs) |

`transformSchema` is checked at 1,000 levels in [`walks a schema one thousand levels deep`](../packages/core/src/__tests__/deep-nesting.test.ts). That walk is still recursive. A deeper value overflows inside Zod's own `safeParse`. The 100,000-level rows above do not call it.

Peers, subpaths, and the Effect method names are in [Optional peers](optional-peers.md), [Subpaths](subpaths.md), and [Effect](effect.md).

## Measured acceleration

The optional Advanced packages were timed with the real C ABI WASM module and the real Node-API addon, not with mocked timings. JS in this table is the `@adaptate/core/verify` / Web Crypto path. Digests matched across JS, WASM, and native. The 4 MiB GPU probe ran on a host with only a software renderer, so GPU stayed unavailable and the work fell back to native.

| Work | Size | JS median | Cached WASM median | Native median |
| --- | --- | --- | --- | --- |
| SHA-256 | 1 KiB | 0.003 ms | 0.034 ms | 0.037 ms |
| SHA-256 | 32 KiB | 0.020 ms | 0.101 ms | 0.057 ms |
| SHA-256 | 2 MiB | 1.181 ms | 6.251 ms | 1.688 ms |
| 4 MiB in-memory verify (3 runs) | 4 MiB | 2.391 ms | — | 3.274 ms (CPU fallback; no hardware GPU) |

WASM bindings: cold hash 6.394 ms, later hash on the cached bindings 0.104 ms. UTF-8 scanning agreed on `café — こんにちは` and on 1 KiB, 32 KiB, and 2 MiB buffers filled with `ä`.

These numbers are why small streaming chunks (~3 µs) stay on zero-dep JS, and why acceleration is documented under [Acceleration](accel.md) as an Advanced option for large or batched work, not a default.

