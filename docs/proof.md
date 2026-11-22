# Proof

Each sentence on the front page maps to something in the repo.

| Sentence | Proof |
| --- | --- |
| One description. Each screen checks only what it shows. A cut-off reply does not throw | One description shared by every screen: [`transformSchema` makes the configured fields required](../packages/core/src/__tests__/index.test.ts). A title-only document passes the card and fails the kitchen: [`final`](../packages/core/src/__tests__/effect.test.ts). A cut-off tool-call delta `{"title":"Pa` parses to `{ title: "Pa" }` and the card check passes: [`createAgUiPartialValidator`](../packages/core/src/__tests__/stream.test.ts) |
| `JSON.parse` throws on that cut-off text, and Adaptate returns `{ title: "Pas" }` with the card check passing | The same test, and [examples/streaming-tool-call](../examples/streaming-tool-call) which installs published `@adaptate/core@2.3.0` and checks both results |
| With only the dish name, the card is ready and the kitchen is not | [`final`](../packages/core/src/__tests__/effect.test.ts) on `{"title":"Pasta"}`: card valid, kitchen invalid |
| When the number of servings arrives, the kitchen is ready too | The same test, on `{"title":"Pasta","servings":2}` |
| A chat checks a tool call while the model is still typing | [AG-UI tool-call deltas, including a cut-off string](../packages/core/src/__tests__/stream.test.ts) and [every parsed prefix keeps the partial-stream invariant](../packages/core/src/__tests__/partial-stream.invariants.property.test.ts) |
| An API write-up becomes those checks, and can be written back out | [YAML load and JSON-schema round trip](../packages/utils/src/__tests__/openapi.test.ts) |
| One description, shared by every screen | [`transformSchema` makes the configured fields required](../packages/core/src/__tests__/index.test.ts) |
| The same checks run in plain code or in an Effect pipeline | [`final(text)` reports every named config; `final(text, "card")` checks that one](../packages/core/src/__tests__/effect.test.ts). `final` agrees with `transformSchema` per config ([I2](../packages/core/src/__tests__/partial-stream.invariants.property.test.ts)) |
| Core ships without extra runtime libraries | [`@adaptate/core` `package.json` has no `dependencies`; `zod` is the peer](../packages/core/package.json). [The main entry and `./stream` load when `effect` is missing](../packages/core/src/__tests__/effect.test.ts) |
| The published types match the build | [`verify-published-types.mjs`](../scripts/verify-published-types.mjs) in the [verify job](../.github/workflows/ci.yml) |
| Types work on current and previous TypeScript | [`ts7-consumer`](../.github/workflows/ci.yml) runs [`ts-consumer-check.mjs`](../scripts/ts-consumer-check.mjs) on TypeScript 7 and 6, for `bundler`, `node16`, and `nodenext` |
| With the schema cached, the streaming check is within about 1.5× of raw Zod per chunk | On Node 24, parsed partial with a cached schema is 0.840 µs/chunk against raw Zod's 0.605 µs/chunk. JSON repair is separate: AG-UI 17.137 µs/chunk minus parsed partial 0.840 µs/chunk is 16.297 µs/chunk. Import median is +4.580% (41.353 ms against 39.542 ms). Full-document rate is −6.583% (2,294,074/s against 2,455,728/s). Method and table: [Performance](performance.md) |

Peers, subpaths, and the Effect method names are in [Optional peers](optional-peers.md), [Subpaths](subpaths.md), and [Effect](effect.md).
