---
title: "Proof"
description: "Each front-page sentence mapped to a test, a script, or a CI job."
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
| `{ title: "Pas" }` passes that card. The same schema with `servings: true` rejects it | [`readme snippets`](../packages/core/src/__tests__/index.test.ts). [examples/react-view](../examples/react-view) renders the card and the kitchen |
| Types ship in the package. CI checks the packed tarballs on TypeScript 7 and 6, for `bundler`, `node16`, and `nodenext` | [`@adaptate/core` publishes `types`](../packages/core/package.json). [`ts7-consumer`](../.github/workflows/ci.yml) runs [`ts-consumer-check.mjs`](../scripts/ts-consumer-check.mjs) |

`transformSchema` is checked at 1,000 levels in [`walks a schema one thousand levels deep`](../packages/core/src/__tests__/deep-nesting.test.ts). That walk is still recursive. A deeper value overflows inside Zod's own `safeParse`. The 100,000-level rows above do not call it.

Peers, subpaths, and the Effect method names are in [Optional peers](optional-peers.md), [Subpaths](subpaths.md), and [Effect](effect.md).
