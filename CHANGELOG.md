# Changelog

All notable changes to this project will be documented in this file.

> **Note**: This project has been in development for approximately **2 years**. The changelog below summarizes major phases. Exact early commit details are summarized from repository history.

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

## 2026-05-11 — Feature-Complete OpenAPI ↔ Zod Converters (Current)

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
- Modernized Credits section

---

**Development Note**: Heavy use of AI coding agents (Grok, Cursor, Claude) throughout development. Early prototyping explored ChatGPT Canvas.
