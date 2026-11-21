# Changelog

All notable changes to this project will be documented in this file.

> **Note**: This project has been in development for approximately **2 years**. The changelog below summarizes major phases.

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

## Unreleased 2.4.0

- `@adaptate/utils` resolves in-document `$ref` pointers locally and has no required runtime dependencies.
- Install optional `js-yaml` to parse YAML, and `@apidevtools/json-schema-ref-parser` to resolve remote or file `$ref`s.

## Unreleased 2.3.0 — Streaming partial validation (RFC-001)

### Added
- `transformPartialSchema`, `validatePartialAgainstConfigs`, `makeStreamingConditionalTransformer`, `DeepPartial`.
- `@adaptate/core/stream`: TanStack AI `partial`/`final` and AG-UI delta adapters, `parsePartialJson`.
- CI job on the latest zod.

