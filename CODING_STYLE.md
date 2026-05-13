# Adaptate Coding Style Guide

## Tools
- `tsc --noEmit`: Typecheck (via `npx turbo run check-types`).
- `npx vitest run --coverage`: Run tests with coverage.
- `pnpm build`: Full build pipeline (check-types → test → build).

## Naming & Structure
- camelCase for functions, variables, parameters.
- PascalCase for types, interfaces, classes.
- UPPER_SNAKE_CASE for constants.
- Files: kebab-case or camelCase matching the primary export.
- Tests: `__tests__/` directory sibling to source, named `*.test.ts`.

## TypeScript Idioms
- Strict mode (`"strict": true`); no `any` unless absolutely unavoidable.
- ESM modules (`"type": "module"` in package.json).
- Prefer `interface` for public API shapes; `type` for unions/intersections.
- Use `instanceof` checks for Zod type narrowing (e.g. `instanceof ZodObject`).
- Prefer `.unwrap()` over `.required()` for stripping `ZodOptional`.

## Zod Patterns
- Never bundle `zod` — it is a peer dependency.
- Recursive schema traversal: treat optional when `schema.safeParse(undefined).success` → `unwrap()` → `instanceof` → recurse (not deprecated `isOptional()`).
- Use `ZodObject.merge()` to combine original + transformed shapes.
- Config-driven: `true` = required, object = recurse, function = conditional.

## Testing
- Unit tests: Vitest with inline snapshots.
- Use `toThrowErrorMatchingInlineSnapshot` for validation error assertions.
- Use `toMatchInlineSnapshot` for structural equality checks.
- Fixtures: YAML/JSON files in `src/fixtures/` alongside tests.
- Cross-package imports via `#utils/*` alias in tests.

## Performance
- Avoid unnecessary object spread in recursive paths.
- Leverage `Object.fromEntries` / `Object.entries` for shape manipulation.
- External `zod` and Node builtins in library builds (Vite rollupOptions).

## Dependencies
- Minimal. Audit before adding.
- `zod`: peer dependency (never bundled).
- `@apidevtools/json-schema-ref-parser`, `js-yaml`: utils runtime deps.
- Dev tooling: Vitest, Vite, Turborepo, TypeScript.

Follow for all future edits.
