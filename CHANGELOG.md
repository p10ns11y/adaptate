# Changelog

All notable changes to this project will be documented in this file.

> **Note**: This project has been in active development for approximately **2 years** (since ~2024). This changelog summarizes the major milestones.

## [0.1.0] - ~2024 — Initial Commit & Early Development

### Added
- Initial commit of the project
- Basic schema validation foundation
- Early exploration of dynamic/adaptable validation patterns

## [0.2.0] — ~2024-2025 — Core Features & Tooling

### Added
- **Dynamic schema builder**
- **Simple version** of the validator
- **Turbo + Vite** bundling setup for monorepo
- Early OpenAPI spec loading + Zod conversion experiments

### Changed
- Improved bundler configuration (prevent dev/prod scramble)
- Increased test coverage and edge case handling

## [0.3.0] - 2026-05-05 — Public Release & Release Automation

### Added
- **@adaptate/core**: Schema transformation engine (`transformSchema`, conditional requirements)
- **@adaptate/utils**: OpenAPI ↔ Zod conversion + YAML loading with `$ref` resolution
- Full monorepo setup (pnpm + Turborepo)
- Comprehensive GitHub Actions CI/CD with OIDC trusted publishing

### Changed
- Major release workflow improvements (auto-publish on version bump, manual bump support)
- Package manager upgraded to pnpm 10.33.3

## [Unreleased] - 2026-05-11 — Feature-Complete OpenAPI ↔ Zod Converters

### Added
- **Fully feature-complete** `@adaptate/utils` converters:
  - Enums, literal unions
  - Full string/number/array validations
  - Combinators (`allOf`/`anyOf`/`oneOf`)
  - `nullable`, proper `required` handling
- Comprehensive test suite + documentation overhaul

### Changed
- Clean exports (removed legacy `incomplete_*` aliases)
- `let` by default coding style
- All READMEs and `AGENTS.md` updated

---

**Development Note**: This project has been developed with heavy assistance from AI coding agents (Grok, Cursor, Claude, etc.). The initial prototype was explored using early ChatGPT Canvas, but current workflows use modern agentic development.
