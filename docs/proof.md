# Proof

Each sentence on the front page maps to something in the repo.

| Sentence | Proof |
| --- | --- |
| One description, shared by every screen | [`transformSchema` makes the configured fields required](../packages/core/src/__tests__/index.test.ts) |
| A card can show the dish name while the kitchen still waits | [title-only document: card valid, kitchen invalid](../packages/core/src/__tests__/effect.test.ts) |
| A chat can check a tool call while the model is still typing | [AG-UI tool-call deltas, including a cut-off string](../packages/core/src/__tests__/stream.test.ts) and [every parsed prefix keeps the partial-stream invariant](../packages/core/src/__tests__/partial-stream.invariants.property.test.ts) |
| An API write-up can become those checks, and go back out | [YAML load and JSON-schema round trip](../packages/utils/src/__tests__/openapi.test.ts) |
| The same checks run in plain code or in an Effect pipeline | [`final(text)` reports every named config; `final(text, "card")` checks that one](../packages/core/src/__tests__/effect.test.ts). `final` agrees with `transformSchema` per config ([I2](../packages/core/src/__tests__/partial-stream.invariants.property.test.ts)) |
| Core ships without extra runtime libraries | [`@adaptate/core` `package.json` has no `dependencies`; `zod` is the peer](../packages/core/package.json). [The main entry and `./stream` load when `effect` is missing](../packages/core/src/__tests__/effect.test.ts) |
| The published types match the build | [`verify-published-types.mjs`](../scripts/verify-published-types.mjs) in the [verify job](../.github/workflows/ci.yml) |
| Types work on current and previous TypeScript | [`ts7-consumer`](../.github/workflows/ci.yml) runs [`ts-consumer-check.mjs`](../scripts/ts-consumer-check.mjs) on TypeScript 7 and 6, for `bundler`, `node16`, and `nodenext` |
| The hot path stays close to the base commit | The [bench job](../.github/workflows/ci.yml) fails when any case is more than 5% slower. The [#53](https://github.com/p10ns11y/adaptate/pull/53) run was 0.989–1.043 ([log](https://github.com/p10ns11y/adaptate/actions/runs/44945033877)) |

Peers, subpaths, and the Effect method names are in [Optional peers](optional-peers.md), [Subpaths](subpaths.md), and [Effect](effect.md).
