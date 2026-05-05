# AGENTS.md - @adaptate/core Package Guidelines

## Overview
Core schema transformation engine. Provides `transformSchema` and `makeConditionalSchemaTransformer` for dynamic Zod schema manipulation based on configuration objects.

## Structure
- `src/index.ts`: Main exports (`transformSchema`, `makeConditionalSchemaTransformer`)
- `src/__tests__/index.test.ts`: Unit tests
- `src/fixtures/`: Test fixtures (JSON/YAML schemas)
- `vite.config.js`: Library build config (ES module output, `zod` externalized)

## Key Patterns
- Recursive schema traversal using `ZodObject` and `ZodArray` types
- `unwrap()` to strip optionality (not `required()`)
- Config objects: `true` = make required, nested object = recurse, function = conditional
- `makeConditionalSchemaTransformer` accepts data for runtime conditional logic via `requiredIf`

## Cross-package
- Imports `@adaptate/utils` via `#utils/*` alias (mapped in `package.json` imports)
- Tests use `#utils/openapi` for OpenAPI ↔ Zod roundtrip assertions

## Rules
- `zod` is a peer dependency — never bundle it
- Build output: `build/index.es.js` (ES module)
- Run `tsc --noEmit` for type checking
- Run vitest from workspace root (no per-package test script)
