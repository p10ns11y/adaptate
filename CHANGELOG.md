# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-05-11

### Added
- **Feature-complete OpenAPI ↔ Zod converters** in `@adaptate/utils`
  - Full support for enums, string/number/array validations, combinators (`allOf`/`anyOf`/`oneOf`), `nullable`, proper `required` handling
  - Bidirectional conversion (`openAPISchemaToZod` + `zodToOpenAPISchema`)
- Comprehensive test suite for new converters (enums, constraints, combinators, roundtrips)

### Changed
- **Simplified exports** in `@adaptate/utils`: Removed legacy alias exports (`incomplete_*`, `simple_*`, `partial_*`). Now only exports the clean primary API:
  - `getDereferencedOpenAPIDocument`
  - `openAPISchemaToZod`
  - `zodToOpenAPISchema`
- **Coding style**: Adopted `let` by default throughout the codebase (user preference). Removed `.eslintrc.json` (linter decision deferred).
- **Documentation overhaul**:
  - Updated all READMEs with clean API names and `.deepPartial()` examples
  - Modernized Credits section to acknowledge AI agent workflows
  - Updated `AGENTS.md` with current project state

### Technical Details
- Major refactor of `packages/utils/src/openapi.ts` (~13KB implementation)
- All CI checks passing
- PR: [#21](https://github.com/p10ns11y/adaptate/pull/21)

## Commits in this release

| Date       | Commit SHA     | Message |
|------------|----------------|---------|
| 2026-05-11 | `7e1c611`     | docs: modernize Credits section (remove outdated ChatGPT Canvas reference) |
| 2026-05-11 | `a442c26`     | docs: improve root README example with .deepPartial() |
| 2026-05-11 | `a4d7199`     | docs: update AGENTS.md with feature-complete utils status and let preference |
| 2026-05-11 | `502b24b`     | docs: update root README to use clean utils API names (feature-complete) |
| 2026-05-11 | `7cca25a`     | test(utils): expand tests for feature-complete OpenAPI ↔ Zod converters |
| 2026-05-11 | `6d91363`     | refactor(utils): replace const with let throughout openapi.ts |
| 2026-05-11 | `c0f4b3b`     | chore: remove .eslintrc.json (linter decision not finalized yet) |
| 2026-05-10 | `4492647`     | revert: keep let in load-yaml.ts as user prefers let style |
| 2026-05-10 | `aaeb0f4`     | feat(utils): simplify exports to clean names now that converters are feature-complete |
| 2026-05-10 | `4c7493b`     | feat(utils): implement full feature-complete OpenAPI ↔ Zod converters |

---

*This changelog was generated for PR #21 on the `feat/make-utils-feature-complete` branch.*
