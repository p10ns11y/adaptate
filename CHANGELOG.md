# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-05-05 — Initial Public Release & Release Automation

### Added
- **@adaptate/core**: Schema transformation engine (`transformSchema`, conditional requirements)
- **@adaptate/utils**: Initial OpenAPI ↔ Zod conversion + YAML loading with `$ref` resolution
- Full monorepo setup (pnpm + Turborepo)
- Comprehensive GitHub Actions CI/CD

### Changed
- Major release workflow improvements:
  - OIDC trusted publishing (no NPM tokens/secrets needed)
  - Auto-publish on version bump in PRs
  - Manual version bump via GitHub Actions (patch/minor/major)
  - Provenance + public npm publishing
- Package manager upgraded to pnpm 10.33.3

### Technical
- Strict TypeScript + Vitest + coverage
- Dual build (browser + SSR) for utils

## [Unreleased] - 2026-05-11 — Feature-Complete OpenAPI ↔ Zod Converters

### Added
- **Fully feature-complete** `@adaptate/utils`:
  - Enums, literal unions
  - Full string/number/array validations (min/max, pattern, format, exclusive*, multipleOf, minItems/maxItems)
  - Combinators: `allOf` (→ `.and()`), `anyOf`/`oneOf` (→ `.union()`)
  - `nullable`, proper `required` handling, descriptions, `ZodDate`/`ZodBigInt`
- Comprehensive test suite (roundtrips, edge cases, combinators)

### Changed
- **Clean API exports** — Removed legacy placeholder aliases (`incomplete_*`, `simple_*`, `partial_*`)
  Now only exports the primary API:
  - `getDereferencedOpenAPIDocument`
  - `openAPISchemaToZod`
  - `zodToOpenAPISchema`
- **Coding style**: `let` by default (user preference). Removed `.eslintrc.json`
- **Documentation overhaul**:
  - All READMEs updated with clean names + `.deepPartial()` examples
  - Modernized Credits section (AI agents as standard)
  - Updated `AGENTS.md`

### Commits (Key)

| Date       | SHA       | Message |
|------------|-----------|---------|
| 2026-05-11 | `7e1c611` | docs: modernize Credits section |
| 2026-05-11 | `a442c26` | docs: improve root README with .deepPartial() |
| 2026-05-11 | `a4d7199` | docs: update AGENTS.md |
| 2026-05-11 | `502b24b` | docs: update root README to clean utils API |
| 2026-05-11 | `7cca25a` | test: expand tests for feature-complete converters |
| 2026-05-11 | `6d91363` | refactor: replace const with let throughout openapi.ts |
| 2026-05-11 | `c0f4b3b` | chore: remove .eslintrc.json |
| 2026-05-10 | `aaeb0f4` | feat: simplify exports to clean names |
| 2026-05-10 | `4c7493b` | feat: implement full feature-complete OpenAPI ↔ Zod converters |

---

**Note**: This project has been developed with heavy AI agent assistance (Grok, Cursor, Claude). The initial prototype explored ChatGPT Canvas, but current workflows use modern agentic development.
