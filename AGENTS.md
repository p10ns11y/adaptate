# AGENTS.md - Global Project Guidelines for Adaptate

## Project Overview
Adaptate is a TypeScript library for dynamic and adaptable model validation using Zod, interoperable with OpenAPI. A pnpm monorepo (Turborepo-orchestrated) with two publishable packages.

## Structure
- `packages/core/`: Schema transformation engine (`transformSchema`, `makeConditionalSchemaTransformer`)
- `packages/utils/`: **Feature-complete** OpenAPI ↔ Zod conversion utilities + YAML loading with full `$ref` resolution

## Commands
- Install: `pnpm install`
- Build: `pnpm build` (runs Turborepo pipeline: check-types → test → build)
- Test: `npx vitest run --coverage` (single run) or `pnpm test` (watch mode)
- Typecheck: `npx turbo run check-types`
- Coverage badge: `pnpm run coveragebadge`

## Coding Style
- TypeScript: Strict typing, no `any`, ESM modules throughout
- **Variable declarations**: Use `let` by default (user preference). `const` is allowed only when reassignment is impossible.
- Naming: CamelCase for types/interfaces, camelCase for functions/variables
- Imports: Group by type (external libs, internal workspace refs)
- Zod patterns: Use `unwrap()` not `required()` for unwrapping optional schemas

## Testing
- Framework: Vitest with v8 coverage
- Location: Tests live in `src/__tests__/*.test.ts` next to implementation
- Assertions: Use `toThrowErrorMatchingInlineSnapshot` and `toMatchInlineSnapshot` for Zod errors
- Coverage: All packages measured; `packages/utils/src/index.ts` (re-export only) excluded
- Cross-package: Core tests import utils via `#utils/openapi` alias

## Commits
- Atomic changes per logical unit
- Messages: "feat: add feature", "fix: resolve issue", "refactor: improve code"
- No secrets or binaries

## Branches
- **Default branch:** `main`
- Feature branches: `cursor/<short-description>-<suffix>` for cloud agents (e.g. `cursor/zod-v4-migration-3f1e`)

## Skills (tool-agnostic SOPs)

Operational guides for common tasks live in [`skills/`](skills/README.md). Any coding agent should check this directory when performing the relevant task:

| Skill | When to use |
|-------|-------------|
| [`skills/add-feature.md`](skills/add-feature.md) | Implementing a new capability |
| [`skills/fix-bug.md`](skills/fix-bug.md) | Investigating and fixing a reported issue |
| [`skills/verify.md`](skills/verify.md) | Running quality gates before committing |
| [`skills/add-test.md`](skills/add-test.md) | Writing new tests |
| [`skills/refactor.md`](skills/refactor.md) | Restructuring code without changing behavior |
| [`skills/release.md`](skills/release.md) | Preparing a version bump for publishing |

## Rules
- Run `npx turbo run check-types` after TypeScript changes
- Run `npx vitest run --coverage` to verify tests pass
- Build pipeline order: `check-types` → `test` → `build` (enforced by `turbo.json`)
- No force pushes to `main`
- Use tools efficiently, cache results
- Escalate on failures
- Before committing: follow [`skills/verify.md`](skills/verify.md)

## Cursor Cloud specific instructions

This is a **TypeScript library monorepo** (pnpm workspaces + Turborepo) with two packages:

- `@adaptate/core` — Schema transformation engine (Zod-based)
- `@adaptate/utils` — **Feature-complete** OpenAPI ↔ Zod conversion utilities

### Quick reference

| Action | Command |
|--------|---------|
| Install deps | `pnpm install` |
| Type check | `npx turbo run check-types` |
| Test (single run) | `npx vitest run --coverage` |
| Test (watch) | `pnpm test` |
| Build | `pnpm build` |

### Non-obvious notes

- **TypeScript** is a workspace `devDependency` (`typescript@6.0.3` at the repo root and in `@adaptate/core` / `@adaptate/utils`) so `tsc` is available from each package’s `node_modules/.bin` after `pnpm install`. No global `typescript` install is required.
- The `turbo.json` build task depends on `^test`, which depends on `check-types`. Running `pnpm build` triggers the full pipeline: check-types → test → build.
- There is a single `tsconfig.json` at the root used by both packages; individual packages do not have their own tsconfigs.
- Tests use Vitest (not Jest), despite `@types/jest` being present in root devDependencies.
- No linter (ESLint/Biome) is configured in this repository; type checking (`tsc --noEmit`) is the primary static analysis.
- The `jest.config.mjs` at the root is legacy and non-functional (references missing `tsconfig.jest.json`); ignore it.
- `packages/utils` builds both a browser bundle (`build/`) and an SSR bundle (`ssr-build/`). Node builtins are externalized in both.
- Path aliases: `#utils/*` maps to `../utils/src/*` in core's `package.json` imports; `@adaptate/*` paths are in root `tsconfig.json`.
