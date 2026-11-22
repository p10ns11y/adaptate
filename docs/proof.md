---
title: "Proof"
description: "Each front-page sentence mapped to a test, a script, or a CI job."
---

# Proof

Each sentence on the front page maps to something in the repo.

| Sentence | Proof |
| --- | --- |
| One schema. Each part of the app checks only the fields it uses | [`transformSchema` makes the configured fields required](../packages/core/src/__tests__/index.test.ts). A title-only value passes the card and fails the kitchen: [examples/react-view](../examples/react-view) |
| A screen, a form, an API client, or a stream | The rows below. The stream is one of those cases |
| A React component checks the fields it renders | [examples/react-view](../examples/react-view) renders a card and a kitchen from one schema. The card shows `Pasta` when the value is `{ title: "Pasta" }`. The kitchen stays waiting until `servings` is present |
| A Vue, Svelte, or Solid component can call `transformSchema` the same way | [`transformSchema`](../packages/core/src/index.ts) returns a Zod schema. [`@adaptate/core` has no React, Vue, Svelte, or Solid dependency](../packages/core/package.json). The repository includes the React example only |
| A form can require the fields collected so far and leave the rest optional | `transformSchema(recipe.partial(), { title: true })` accepts `{ title: "Pas" }` and rejects `{}` ([`index.test.ts`](../packages/core/src/__tests__/index.test.ts), [examples/react-view](../examples/react-view)) |
| An API response is the same check. An OpenAPI write-up can become the Zod schema, and a Zod schema can be written back out | [YAML load and JSON-schema round trip](../packages/utils/src/__tests__/openapi.test.ts) |
| A config names the fields each view requires | The card config is `{ title: true }` checked against `z.infer` of the recipe ([`index.test.ts`](../packages/core/src/__tests__/index.test.ts)) |
| A chat can check a tool call while the model is still typing | [AG-UI tool-call deltas, including a cut-off string](../packages/core/src/__tests__/stream.test.ts) and [every parsed prefix keeps the partial-stream invariant](../packages/core/src/__tests__/partial-stream.invariants.property.test.ts) |
| `JSON.parse` throws on that cut-off text, and Adaptate returns `{ title: "Pas" }` with the card check passing | The same test, and [examples/streaming-tool-call](../examples/streaming-tool-call) which installs published `@adaptate/core@2.3.0` and checks both results |
| With only the dish name, the card is ready and the kitchen is not | [`final`](../packages/core/src/__tests__/effect.test.ts) on `{"title":"Pasta"}`: card valid, kitchen invalid |
| When the number of servings arrives, the kitchen is ready too | The same test, on `{"title":"Pasta","servings":2}` |
| The same checks run in plain code or in an Effect pipeline | [`final(text)` reports every named config; `final(text, "card")` checks that one](../packages/core/src/__tests__/effect.test.ts). `final` agrees with `transformSchema` per config ([I2](../packages/core/src/__tests__/partial-stream.invariants.property.test.ts)) |
| Core ships without extra runtime libraries | [`@adaptate/core` `package.json` has no `dependencies`; `zod` is the peer](../packages/core/package.json). [The main entry and `./stream` load when `effect` is missing](../packages/core/src/__tests__/effect.test.ts) |
| The published types match the build | [`verify-published-types.mjs`](../scripts/verify-published-types.mjs) in the [verify job](../.github/workflows/ci.yml) |
| The types ship in the package. A value's type is inferred from the Zod schema you write | [`@adaptate/core` publishes `types`](../packages/core/package.json). The card config is checked against `z.infer` of the recipe ([`index.test.ts`](../packages/core/src/__tests__/index.test.ts)) |
| CI checks the packed types (the exact tarballs npm would get) on TypeScript 7 and 6, for `bundler`, `node16`, and `nodenext` | [`ts7-consumer`](../.github/workflows/ci.yml) runs [`ts-consumer-check.mjs`](../scripts/ts-consumer-check.mjs) |
| Node v24.22.3. Commit 233627c. One local node bench/ab/run.js | [`assets/perf-run.json`](../assets/perf-run.json) is that run's Node and bundle fields. [`scripts/render-perf-chart.mjs`](../scripts/render-perf-chart.mjs) draws [`assets/perf.svg`](../assets/perf.svg) from that file and fails if a field is missing. Four views per render is measured and is not drawn. AG-UI on that run is 17.240 µs/chunk |
| A partial JSON stream resumes its bracket scan | [`createPartialJsonParser`](../packages/core/src/partial-json.ts) resumes the bracket and string state and counts characters passed to `JSON.parse`. [`parsePartialJson`](../packages/core/src/stream.ts) still closes a whole prefix. The grocery order passes 68,714 characters to `JSON.parse` across 130 parses. A full rescan was 68,304 character visits |

Peers, subpaths, and the Effect method names are in [Optional peers](optional-peers.md), [Subpaths](subpaths.md), and [Effect](effect.md).
