# Development

Install and build this repo with pnpm. Root `package.json` sets `"packageManager": "pnpm@11.1.1"`. `.npmrc` and `pnpm-workspace.yaml` set lifecycle restrictions, store integrity, and the release-age gate. `npm install` at the repo root is unsupported: npm does not apply those settings, and the tree can diverge from CI.

`pnpm add` / `npm install` of the published `@adaptate/*` packages is how consumers install from the registry.

Engines: the repo and `@adaptate/core` require Node `>=24`. `@adaptate/utils` declares Node `>=20`.

```sh
pnpm install
pnpm lint
pnpm test          # check-types, then vitest run --coverage
pnpm test:watch
pnpm build         # turbo run build
pnpm typecheck
```

`turbo.json` makes `build` depend on dependency `check-types` and dependency `test`.

```
├── .devcontainer/   # Node 24 + pnpm
├── docs/
├── packages/core/   # @adaptate/core
├── packages/utils/  # @adaptate/utils
├── skills/
├── AGENTS.md
├── CODING_STYLE.md
└── turbo.json
```

Agent procedures: [AGENTS.md](../AGENTS.md), [skills/](../skills/). Dev container: [.devcontainer/README.md](../.devcontainer/README.md).

The pattern comes from [Oneflow AB](https://oneflow.com): one data model, several components, different required fields. The first prototype was a ChatGPT Canvas. PR [#21](https://github.com/p10ns11y/adaptate/pull/21) is the first agent-written change in the repo.

License: MIT.
