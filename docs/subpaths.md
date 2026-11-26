---
title: "Subpaths"
description: "The published entry points, and which peers each one loads."
answer: "@adaptate/core publishes seven entry points: the root, /stream, /stream-incremental, /standard, /effect, /result, and /verify. zod is the only required peer, and effect loads only from /effect. Optional acceleration lives in separate packages, not in core."
faq:
  - question: "Which entry point should a chat UI use?"
    answer: "@adaptate/core/stream-incremental for long streams, or @adaptate/core/stream for the re-parse path and createFrameThrottle."
  - question: "Which @adaptate/utils path loads a spec from disk?"
    answer: "@adaptate/utils/openapi or @adaptate/utils/ssr."
---

# Subpaths

`@adaptate/core` publishes seven entries and has no `dependencies`. `zod@^3.25.0 || ^4.0.0` is the required peer. `effect@^4.0.0` is an optional peer and is imported only by `@adaptate/core/effect`.

```mermaid
flowchart LR
  zod["zod peer"] --> core["@adaptate/core"]
  zod --> stream["@adaptate/core/stream"]
  zod --> incremental["@adaptate/core/stream-incremental"]
  zod --> standard["@adaptate/core/standard"]
  zod --> effect["@adaptate/core/effect"]
  zod --> result["@adaptate/core/result"]
  zod --> verify["@adaptate/core/verify"]
  effectPeer["effect optional peer"] -.-> effect
```

| Entry | Exports |
| --- | --- |
| `@adaptate/core` | `transformSchema`, `makeConditionalSchemaTransformer`, `transformPartialSchema`, `validatePartialAgainstConfigs`, `makeStreamingConditionalTransformer`, `Config`, `DeepPartial`, `PartialValidationResult` |
| `@adaptate/core/stream` | `parsePartialJson`, `createStreamValidator`, `validateStructuredOutput`, `createAgUiPartialValidator`, `agUiValidatorWith`, `reparseFeed`, `createFrameThrottle`, `AgUiDeltaEvent`, `PartialJsonFeed` |
| `@adaptate/core/stream-incremental` | `createPartialJsonFeed`, `fromAsyncIterable`, `fromAsyncIterableSteps`, `isSettled`, `createAgUiPartialValidator`, `PartialJsonFeed`, `JsonStreamStep`, `TrackedStep`, `JsonPath` |
| `@adaptate/core/standard` | `isStandardSchema`, `validateStandard`, `validateAgainstStandardSchemas`, `StandardSchemaV1`, `StandardIssue`, `StandardResult`, `StandardValidationResult` |
| `@adaptate/core/result` | `parse`, `parseAsync`, `parseStream`, `ok`, `err`, `isResult`, `isSettled`, `Result`, `Ok`, `Err`, `Track`, `Issues`, `StreamStep`, `JsonPath` |
| `@adaptate/core/effect` | `validate`, `validatePartial`, `createEffectStreamValidator`, `AdaptateValidationError`, `AdaptateParseError`, `ConfigReport`, `FinalReport` |
| `@adaptate/core/verify` | `hashBuffer`, `hexFromBytes`, `normalizeHex`, `verifiersFrom`, `verifyBuffer`, `verifyStream`, `Verifier`, `VerifyContext`, `VerifyFailure`, `VerifyManifest`, `HashAlgorithm`, `VerifyCheck`, `VerifyResult` |

`@adaptate/core/stream-incremental` also exports `createTrackedFeed` and `TrackedFeed`, which `makeFeed` returns.

Optional Advanced packages are not core subpaths and are not pulled in by `@adaptate/core`:

| Package | What it is for |
| --- | --- |
| `@adaptate/accel` | Probe and size-route large-buffer or batched in-memory work |
| `@adaptate/wasm` | Portable C ABI WASM. Browsers should import `@adaptate/wasm/runtime` so `node:fs` does not enter the bundle. |
| `@adaptate/native` | Node-API bindings, including an optional hardware GPU path above 4 MiB |

`@adaptate/utils` has no required runtime dependencies. Its peers are in [Optional peers](optional-peers.md). Published paths:

| Import | Runtime file |
| --- | --- |
| `@adaptate/utils` | `build/index.es.js` (browser bundle; Node builtins are external) |
| `@adaptate/utils/openapi` | `ssr-build/openapi.js` |
| `@adaptate/utils/ssr` | `ssr-build/index.js` |

Use `/ssr` or `/openapi` when loading a spec from disk.
