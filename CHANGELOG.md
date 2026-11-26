# Changelog

All notable changes to this project will be documented in this file.

> **Note**: This project has been in development for approximately **2 years**. The changelog below summarizes major phases.

## Unreleased

## 3.0.0 — 2026-11-26 — makeFeed hook, runtime verify, optional acceleration

### Added
- `fromAsyncIterableSteps` and `parseStream` accept an optional `makeFeed` factory. The default tracked feed is unchanged, and `openPath` / `tailOpen` stay on the step.
- `@adaptate/core/verify`: fail-closed in-memory `hashBuffer`, `verifyBuffer`, and `verifyStream` hooks for issue 84. This is a new subpath of zero-dependency `@adaptate/core`.
- Optional Advanced packages `@adaptate/accel`, `@adaptate/wasm`, and `@adaptate/native`, plus the Rust `adaptate-accel` core they wrap. They are not part of the default install.
- Site docs: build-time Shiki highlighting, v3 guides, an Advanced nav group for acceleration and runtime verification, and a browser live benchmark of `@adaptate/core/verify` against `@adaptate/wasm`.
- `fromAsyncIterableSteps` and `parseStream` steps carry `openPath` (keys from the root to the deepest open value) and `tailOpen` (that value is a cut-off string, number or keyword). A value off `openPath` is final unless the document repeats a key on that path later (`JSON.parse` lets the last duplicate win). A complete document has `openPath: []` and `tailOpen: false`.
- `isSettled(step, path)` from `@adaptate/core/stream-incremental` and `@adaptate/core/result`, and the `JsonPath` type. It is `true` for any present path on a complete (or `done` and ok) step, and `false` for a path that has not arrived. Array steps take integer index keys only, so `isSettled(step, ["tags", "length"])` is `false`. A partial step whose partial schema fails has no `result.value`, so no path on it is settled.
- `isResult(value)` from `@adaptate/core/result`. `ok` and `err` carry a non-enumerable `Symbol.for("adaptate.result")` brand, so a plain `{ ok: true, value }` is not a `Result`.

### Compatibility
- `openPath` and `tailOpen` are additive. They are optional (`readonly openPath?`, `readonly tailOpen?`) on `JsonStreamStep` and `StreamStep`, so hand-built steps still typecheck. At runtime they are non-enumerable own properties, so `toEqual({ value, complete })`, `toEqual({ done, result })`, spreads, and `JSON.stringify` of a step are unchanged. A spread copy drops them; `isSettled` then answers `false` until the step is complete.
- Malformed input: a string with a raw control character or a bad escape is never committed. It stays the open tail (`tailOpen: true`) on a step that never completes, so a cut or bad string never reads as settled. Numbers and `true`, `false`, `null` share one rule: a scalar commits only once whitespace, `,`, `}` or `]` follows it, or the stream ends on it. Until then it is the open tail. A scalar glued to any other character (`{"a":1.x}`, `{"a":12-3}`, `{"a":truex}`, `[true1]`) is never committed and never settled.
- A keyword that ends a chunk (`{"a":true`) is now held as the open tail (`tailOpen: true`) until the next character arrives, as numbers already were. A root `true` completes when the stream ends.
- `fromAsyncIterableSteps` yields the exported `TrackedStep` type, so `openPath` and `tailOpen` show in the generated docs. It is assignable to `JsonStreamStep`.

### Changed
- The fast-check suite is described as property-checked invariants.
- Docs: `parseStream` reads strict JSON only, with no revivers or references.

### Edge
- The brand is an own symbol property. A JSON round trip or an object spread (`{ ...result }`) drops it, so the copy fails `isResult`. `structuredClone` throws on a `Result` because it holds methods.

## Early Development (~2024 – early 2026)

### Added
- Initial commit and project foundation
- Basic dynamic schema validation concepts
- Simple version of the adaptable validator
- Dynamic schema builder
- Early OpenAPI spec loading + Zod conversion experiments

### Changed
- Adopted Turbo + Vite for bundling
- Improved bundler configuration (dev/prod consistency)
- Increased test coverage and edge case handling

## 2026-05-05 — Release Automation & Public Polish

### Added
- Full GitHub Actions release workflow with OIDC trusted publishing
- Auto-publish on version change + manual bump support
- Package manager upgraded to pnpm 10

## 2026-05-11 — Feature-Complete OpenAPI ↔ Zod Converters (Current PR)

### Added
- **Fully feature-complete** `@adaptate/utils`:
  - Enums, literal unions
  - Full string/number/array validations
  - Combinators (`allOf` / `anyOf` / `oneOf`)
  - `nullable`, proper `required` handling
- Comprehensive test suite + roundtrip tests

### Changed
- Clean exports (removed legacy `incomplete_*` aliases)
- `let` by default coding style
- Full documentation update (READMEs, AGENTS.md, `.deepPartial()` examples)

**Development note**: Initial prototype was created with ChatGPT Canvas. All important caveats and refinements were manually corrected by the author. The PR (#21) marks the first use of AI coding agents (Grok) in the project. Cursor Cloud Agent prepared the repo for agentic development workflows.

## 2.3.0 — 2026-11-22 — Streaming partial validation (RFC-001)

### Added
- `transformPartialSchema`, `validatePartialAgainstConfigs`, `makeStreamingConditionalTransformer`, `DeepPartial`.
- `@adaptate/core/stream`: TanStack AI `partial`/`final` and AG-UI delta adapters, `parsePartialJson`.
- CI job on the latest zod.

## 2.4.2 — 2026-11-23 — Result guard for choke points

### Added
- `@adaptate/core/result`: `parse` returns a `Result` with `map`, `flatMap`, `mapError`, `recover` and `match`; `parseAsync` resolves to one. `parseStream` yields steps that each carry a `Result`, and its last step errs unless the stream holds one complete JSON value.
- `@adaptate/core/stream-incremental`: `fromAsyncIterableSteps` marks when the root JSON value closes.
- Guide: Find your choke points.

## 2.4.1 — 2026-11-23 — Readable @adaptate/utils build

### Changed
- `@adaptate/utils` ships an unminified browser build, so the published code reads the same as the source.
- The `@adaptate/utils` README states its one network call: `fetchYamlContent(webURL)` fetches only the URL you pass.

## 2.4.0 — 2026-11-22 — Streaming feed, deep input, Standard Schema

### Added
- `@adaptate/core/standard`: validate with any Standard Schema (zod, Valibot, ArkType), no new dependencies.
- `@adaptate/core/effect` (optional Effect 4 peer): `validate`, `validatePartial`, and a stream helper, with tagged `AdaptateValidationError` and `AdaptateParseError`.
- Validation is pure, so this integration does not retry.
- `@adaptate/core/stream-incremental`: `createPartialJsonFeed` tokenizes a JSON stream once. An open string keeps its decoded prefix, and a push copies the deepest open container and the spine above it. `fromAsyncIterable` reads strings or UTF-8 bytes and yields each partial value. `createAgUiPartialValidator` on that subpath uses the feed. `@adaptate/core/stream` still appends to a buffer and calls `parsePartialJson`. Both validators drop a slot on `TOOL_CALL_END`, `TEXT_MESSAGE_END`, and `close(id)`. `createEffectStreamValidator` takes an optional feed and uses the re-parse feed when it is omitted.
- `createFrameThrottle` emits the latest value on the next frame.
- Deep runtime input no longer overflows the call stack. Streamed JSON, partial values, `openAPISchemaToZod`, `zodToOpenAPISchema` and local `$ref` dereference walk with explicit stacks (Knuth 1974, recursion elimination). A 50,000-level chain runs in about 80 ms.

### Changed
- `final(text)` parses strict JSON, requires the base schema, and returns `{ value, configs }` for every named config. `final(text, configName)` validates that one config, and fails with `AdaptateValidationError` when `configName` is not an own key of `configs`. `validatePartial` keeps issues from a thrown `ZodError`.

### Changed — what consumers install
- `@adaptate/utils` resolves in-document `$ref` pointers locally. Install optional `js-yaml` 5 to parse YAML, and `@apidevtools/json-schema-ref-parser` 16 to resolve remote or file `$ref`s.
- `@adaptate/utils` no longer requires `@apidevtools/json-schema-ref-parser` or `js-yaml`. Optional peers are parser 16 and js-yaml 5. Core still has zero runtime dependencies.
- `@types/js-yaml` dropped; js-yaml 5 ships its own types.
- Dev TypeScript is 7.0.2. Oxlint type-aware lint (`oxlint-tsgolint`) replaces ESLint `@typescript-eslint/no-deprecated`.

