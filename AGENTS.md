# AGENTS.md - Global Project Guidelines for Adaptate

## Project Overview
Adaptate is a TypeScript library for dynamic and adaptable model validation using Zod, interoperable with OpenAPI. A pnpm monorepo (Turborepo-orchestrated) with two publishable packages.

## Structure
- `packages/core/`: Schema transformation engine (`transformSchema`, `makeConditionalSchemaTransformer`)
- `packages/utils/`: **Feature-complete** OpenAPI ↔ Zod conversion utilities + YAML loading with full `$ref` resolution
- `apps/site/`: private static site (landing, docs, SEO). Build with `pnpm --filter adaptate-site build`; see [apps/site/README.md](apps/site/README.md)

## Docs files

What each file under `docs/` is for. The public guide list is [docs/index.md](docs/index.md).

- `index.md`: docs home and install
- `transform.md`: one Zod schema and a per-view config
- `streaming.md`: check a tool call while JSON is still arriving
- `ag-ui.md`: AG-UI tool-call deltas against each view
- `web-streams.md`: ReadableStream, SSE, or a Node stream into the parser
- `openapi.md`: OpenAPI to Zod and back
- `zod.md`: Config per view and the Standard Schema interface
- `effect.md`: the same checks in an Effect pipeline
- `choke-points.md`: parse to an ok or error track, then map, flatMap, or recover
- `typescript.md`: shipped types, checked on TypeScript 7 and 6
- `subpaths.md`: published entry points and their peers
- `optional-peers.md`: effect, js-yaml, and the ref parser load only when imported
- `migration-2.4.md`: YAML and the ref parser became optional peers
- `development.md`: install, test, and build this repository
- `incremental-parser.md`: tokenize a JSON stream once and reuse closed values
- `performance.md`: measured cost and recorded runs
- `proof.md`: each front-page claim and the test or script that covers it
- `credits.md`: site media credits (logo, wordmark, palette). Not a product guide
- `inspiration.md`: ideas the library borrows, including overreacted.io
- `api/`: generated API reference

## Using adaptate

Consumer recipes. Types ship in the packages. The doc map is [docs/index.md](docs/index.md). The agent index is [llms.txt](llms.txt). A runnable React view is [examples/react-view](examples/react-view). A runnable stream check is [examples/streaming-tool-call](examples/streaming-tool-call). Vue, Svelte, and Solid can call `transformSchema` the same way. This repository includes the React example.

One schema, and a card that needs the title:

```ts
import { z } from "zod";
import { transformSchema, type Config } from "@adaptate/core";

const recipe = z.object({ title: z.string(), servings: z.number() });
type Recipe = z.infer<typeof recipe>;
const card = { title: true } satisfies Config<Recipe>;
const cardSchema = transformSchema(recipe.partial(), card);
cardSchema.parse({ title: "Pas" });
```

A tool call that is still typing:

```ts
import { z } from "zod";
import { createAgUiPartialValidator } from "@adaptate/core/stream";

const push = createAgUiPartialValidator(
  z.object({ title: z.string(), servings: z.number() }),
  { card: { title: true } },
);
const check = push({
  type: "TOOL_CALL_ARGS",
  toolCallId: "call-1",
  delta: '{"title":"Pas',
});
```

`check.partial` is `{ title: "Pas" }` and `check.results.card.valid` is `true`. `JSON.parse` on that same text throws.

An OpenAPI object schema becomes a Zod schema:

```ts
import { openAPISchemaToZod } from "@adaptate/utils";

const zodSchema = openAPISchemaToZod({
  type: "object",
  required: ["title"],
  properties: { title: { type: "string" }, servings: { type: "integer" } },
});
zodSchema.parse({ title: "Pas" });
```

## Dev container (optional filesystem isolation)

Requires **Docker** or **Podman** and **Dev Containers** (**VS Code:** Microsoft `ms-vscode-remote.remote-containers`; **Cursor:** Anysphere **`anysphere.remote-containers`** — search Extensions for “Dev Containers”). Open the repo with **Dev Containers: Reopen in Container**. The workspace is the bind-mounted repository only (your host home is not mounted by default—keep it that way unless you deliberately need extra mounts).

Configuration lives in [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json): **Node 24** image, **pnpm@11.1.1** via Corepack (matches root `engines` and `packageManager`). After the container starts, `postCreateCommand` runs `pnpm install --frozen-lockfile --ignore-scripts`, aligned with CI. Short how-to: [`.devcontainer/README.md`](.devcontainer/README.md).

## Commands
- Install: `pnpm install` only — do **not** use `npm install` at the repo root (supply-chain posture in `.npmrc` + `pnpm-workspace.yaml` is for pnpm; npm bypasses or mismatches key defenses; see `package.json` `packageManager`)
- Build: `pnpm build` (runs Turborepo pipeline: check-types → test → build)
- Test: `npx vitest run --coverage` (single run) or `pnpm test` (watch mode)
- Typecheck: `npx turbo run check-types`
- **Lint:** `pnpm lint` — **Oxlint** type-aware (`oxlint --type-aware` with `oxlint-tsgolint`, see `.oxlintrc.json`): correctness plus `typescript/no-deprecated`, `typescript/no-floating-promises`, and `typescript/no-misused-promises`. Per-package: `pnpm turbo run lint`. Deprecations only: `pnpm run lint:deprecation`.
- **Lint fixes (Oxlint auto-fix where supported):** `pnpm run lint:fix`. Deprecated call sites usually need a hand edit or codemod; the deprecation rule does not rewrite them.
- Coverage badge: `pnpm run coveragebadge`
- API docs and agent indexes, after a build: `pnpm docs:api` (rewrites `docs/api/`, `llms.txt`, and `llms-full.txt`)

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
| [`.cursor/skills/formal-verification/SKILL.md`](.cursor/skills/formal-verification/SKILL.md) | Re-checking partial and stream invariants I1 and I2 |

## Rules
- Run `npx turbo run check-types` after TypeScript changes
- Run `pnpm lint` to run Oxlint type-aware rules, including `typescript/no-deprecated`, on package sources (also enforced in GitHub Actions: `.github/workflows/ci.yml` runs lint, then `pnpm test`, then `turbo run build`)
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

- **Package manager:** Use **pnpm** only (`pnpm install`). **`npm install`** at the repo root breaks from the repo’s **supply-chain defenses** (`.npmrc`, `pnpm-workspace.yaml`) and can diverge from CI — not supported for developing Adaptate.

| Tool | Role |
|------|------|
| **Oxlint** (`.oxlintrc.json`) | Correctness lint plus type-aware rules via `oxlint-tsgolint` (`typescript/no-deprecated`, `typescript/no-floating-promises`, `typescript/no-misused-promises`). Expand categories locally if desired (many style rules warn loudly on tests). |

- **TypeScript** is a workspace `devDependency` (`typescript@7.0.2` at the repo root and in `@adaptate/core` / `@adaptate/utils`) so `tsc` is available from each package’s `node_modules/.bin` after `pnpm install`. No global `typescript` install is required. Type-aware lint uses `oxlint-tsgolint` (typescript-go), not the workspace `typescript` package.
- The `turbo.json` build task depends on `^test`, which depends on `check-types`. Running `pnpm build` triggers the full pipeline: check-types → test → build.
- There is a single `tsconfig.json` at the root used by both packages; individual packages do not have their own tsconfigs.
- Tests use Vitest (not Jest), despite `@types/jest` being present in root devDependencies.
- The `jest.config.mjs` at the root is legacy and non-functional (references missing `tsconfig.jest.json`); ignore it.
- CI job `ts7-consumer` builds the packages, packs `@adaptate/core` and `@adaptate/utils`, and runs `tsc --noEmit` in a temp project on TypeScript 7 and 6 (`scripts/ts-consumer-check.mjs`). Import specifiers come from built `.d.ts` files. `moduleResolution` is checked for `bundler`, `node16`, and `nodenext`.
- `packages/utils` builds both a browser bundle (`build/`) and an SSR bundle (`ssr-build/`). Node builtins are externalized in both.
- **Bundler:** Both packages use **Vite 8** (`vite@^8.0.10` in each package; lockfile pins `vite@8.0.10`). Production `vite build` uses **Rolldown** (Vite’s default bundler in v8). There is no `rolldown-vite` dependency alias and no `pnpm.overrides` entry for Vite—stay on plain `vite` from the registry.
- After a Vite major bump, run `pnpm build` and spot-check `packages/core/build/`, `packages/utils/build/`, and `packages/utils/ssr-build/` (entry files, chunk names, `.map` files) before releasing.
- **[Socket.dev](https://socket.dev/) package scores** blend supply chain, vulnerability, quality, maintenance, and license signals; the headline badge is **not** a simple average (see [Package Scores](https://docs.socket.dev/docs/package-scores)). On the **`adaptate`** overview, the **Socket 69** headline aligns with **Supply Chain Security 69** (low adoption and related signals hurt that dimension). Other gauges are typically **Vulnerability 100**, **Quality 100**, **Maintenance 89**, **License 100**—Socket may still show a **Quality**-tagged notice such as **“Unpopular package”** (low npm footprint) even when the Quality gauge is high. Use the **live per-category bars and warnings** on the version page; numbers drift by version ([`skills/release.md`](skills/release.md) for post-release re-checks).
- Path aliases: `#utils/*` maps to `../utils/src/*` in core's `package.json` imports; `@adaptate/*` paths are in root `tsconfig.json`.
