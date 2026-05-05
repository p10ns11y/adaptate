# AGENTS.md

## Cursor Cloud specific instructions

This is a **TypeScript library monorepo** (pnpm workspaces + Turborepo) with two packages:

- `@adaptate/core` — Schema transformation engine (Zod-based)
- `@adaptate/utils` — OpenAPI ↔ Zod conversion utilities

### Quick reference

| Action | Command |
|--------|---------|
| Install deps | `pnpm install` |
| Type check | `npx turbo run check-types` |
| Test (single run) | `npx vitest run --coverage` |
| Test (watch) | `pnpm test` |
| Build | `pnpm build` |

### Non-obvious notes

- **TypeScript must be installed globally** (`npm install -g typescript@5.6.3`) because it is not listed in `package.json` devDependencies but is required by the `check-types` scripts in both packages. The lockfile pins it via ts-jest but pnpm strict mode doesn't hoist it.
- The `turbo.json` build task depends on `^test`, which depends on `check-types`. Running `pnpm build` triggers the full pipeline: check-types → test → build.
- There is a single `tsconfig.json` at the root used by both packages; individual packages do not have their own tsconfigs.
- Tests use Vitest (not Jest), despite `@types/jest` being present in root devDependencies.
- No linter (ESLint/Biome) is configured in this repository; type checking (`tsc --noEmit`) is the primary static analysis.
