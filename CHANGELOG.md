# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-05-11

### Added
- **Fully feature-complete OpenAPI ↔ Zod converters** in `@adaptate/utils`
  - Enums, string/number/array validations, combinators (`allOf`/`anyOf`/`oneOf`), `nullable`, proper `required` handling
  - Bidirectional: `openAPISchemaToZod` + `zodToOpenAPISchema`
- Comprehensive Vitest test suite for the new converters

### Changed
- **Clean exports**: Removed legacy alias exports (`incomplete_*`, `simple_*`, `partial_*`)
- **Coding style**: `let` by default throughout the codebase (user preference)
- **Documentation**: All READMEs and `AGENTS.md` updated with clean API names and modern examples (`.deepPartial()`)
- **Credits section**: Modernized to acknowledge AI agent workflows as the new standard

### Technical
- Major refactor of `packages/utils/src/openapi.ts`
- All CI checks passing
- PR: [#21](https://github.com/p10ns11y/adaptate/pull/21)

---

## Project History (Major Milestones)

### May 2026
- **2026-05-11** — Feature-complete OpenAPI ↔ Zod converters + comprehensive tests + documentation overhaul
- **2026-05-10** — Start of `feat/make-utils-feature-complete` branch; initial implementation of full converters
- **2026-05-05** — Major CI/release workflow improvements (OIDC trusted publishing, auto-trigger on version change, pnpm 10 support)

### Early Development (May 2026)
- Initial monorepo setup with `@adaptate/core` and `@adaptate/utils`
- Core schema transformation engine (`transformSchema`, conditional requirements)
- Release automation with OIDC trusted publishing (no NPM secrets needed)
- Multiple iterations on CI workflows for reliable npm publishing

---

*This changelog summarizes major changes across the entire project history (ignoring trivial CI/config tweaks).*
