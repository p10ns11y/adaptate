---
title: "Development"
description: "Install, test, and build this repository with pnpm."
---

# Development

Install and build this repo with pnpm. Root `package.json` sets `"packageManager": "pnpm@11.1.1"`. `.npmrc` and `pnpm-workspace.yaml` set lifecycle restrictions, store integrity, and the release-age gate. `npm install` at the repo root is unsupported: npm does not apply those settings, and the tree can diverge from CI.

`pnpm add` / `npm install` of the published `@adaptate/*` packages is how consumers install from the registry.

`pnpm docs:api` rewrites [docs/api](api/index.md) from the built `.d.ts` files, and rewrites `llms.txt` and `llms-full.txt`. Run it after `pnpm build`. The verify job fails when those files drift.

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
├── bench/ab/        # A/B runtime eval
├── docs/
├── packages/core/   # @adaptate/core
├── packages/utils/  # @adaptate/utils
├── skills/
├── tools/api-docs/  # TypeDoc markdown from the published .d.ts files
├── AGENTS.md
├── CODING_STYLE.md
└── turbo.json
```

Agent procedures: [AGENTS.md](../AGENTS.md), [skills/](../skills/). Dev container: [.devcontainer/README.md](../.devcontainer/README.md).

The pattern comes from [Oneflow AB](https://oneflow.com): one data model, several components, different required fields. The first prototype was a ChatGPT Canvas. PR [#21](https://github.com/p10ns11y/adaptate/pull/21) is the first agent-written change in the repo.

License: MIT.
