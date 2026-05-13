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
- **Lint:** `pnpm lint` — **Oxlint** (correctness / general fast lint, see `.oxlintrc.json`) then **ESLint** deprecation-only (`@typescript-eslint/no-deprecated`, see `eslint.config.js`). Per-package: `pnpm turbo run lint`.
- **Lint fixes (Oxlint auto-fix where supported):** `pnpm run lint:fix` then address any remaining ESLint deprecation findings by hand or codemod.
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
- Run `pnpm lint` to run Oxlint and ESLint (deprecation) on package sources (also enforced in GitHub Actions: `.github/workflows/ci.yml` runs lint, then `pnpm test`, then `turbo run build`)
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
| Lint | `pnpm lint` |
| Build | `pnpm build` |

### Non-obvious notes

| Tool | Role |
|------|------|
| **Oxlint** (`.oxlintrc.json`) | Fast lint; default **correctness** category for CI. Expand categories locally if desired (many style rules warn loudly on tests). |
| **ESLint** (`eslint.config.js`) | **Deprecation detection only:** `@typescript-eslint/no-deprecated` (requires types from dependencies). |

- **TypeScript** is a workspace `devDependency` (`typescript@6.0.3` at the repo root and in `@adaptate/core` / `@adaptate/utils`) so `tsc` is available from each package’s `node_modules/.bin` after `pnpm install`. No global `typescript` install is required.
- The `turbo.json` build task depends on `^test`, which depends on `check-types`. Running `pnpm build` triggers the full pipeline: check-types → test → build.
- There is a single `tsconfig.json` at the root used by both packages; individual packages do not have their own tsconfigs.
- Tests use Vitest (not Jest), despite `@types/jest` being present in root devDependencies.
- No legacy ESLint config beyond **`eslint.config.js`** (flat config). Deprecation-only rules; general lint is Oxlint.
- The `jest.config.mjs` at the root is legacy and non-functional (references missing `tsconfig.jest.json`); ignore it.
- `packages/utils` builds both a browser bundle (`build/`) and an SSR bundle (`ssr-build/`). Node builtins are externalized in both.
- **Bundler:** Both packages use **Vite 8** (`vite@^8.0.10` in each package; lockfile pins `vite@8.0.10`). Production `vite build` uses **Rolldown** (Vite’s default bundler in v8). There is no `rolldown-vite` dependency alias and no `pnpm.overrides` entry for Vite—stay on plain `vite` from the registry.
- After a Vite major bump, run `pnpm build` and spot-check `packages/core/build/`, `packages/utils/build/`, and `packages/utils/ssr-build/` (entry files, chunk names, `.map` files) before releasing.
- **[Socket.dev](https://socket.dev/) package scores** blend supply chain, vulnerability, quality, maintenance, and license signals; the headline badge is **not** a simple average (see [Package Scores](https://docs.socket.dev/docs/package-scores)). On the **`adaptate`** overview, the **Socket 69** headline aligns with **Supply Chain Security 69** (low adoption and related signals hurt that dimension). Other gauges are typically **Vulnerability 100**, **Quality 100**, **Maintenance 89**, **License 100**—Socket may still show a **Quality**-tagged notice such as **“Unpopular package”** (low npm footprint) even when the Quality gauge is high. Use the **live per-category bars and warnings** on the version page; numbers drift by version ([`skills/release.md`](skills/release.md) for post-release re-checks).
- Path aliases: `#utils/*` maps to `../utils/src/*` in core's `package.json` imports; `@adaptate/*` paths are in root `tsconfig.json`.
