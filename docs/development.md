---
title: "Development"
description: "Install, test, and build this repository with pnpm."
answer: "Develop adaptate with pnpm 11.1.1 on Node 24. Run pnpm install, pnpm lint, pnpm test, and pnpm build. npm install at the repository root is not supported."
faq:
  - question: "Why not npm install?"
    answer: "npm does not apply the supply-chain settings in .npmrc and pnpm-workspace.yaml, and the tree can diverge from CI."
  - question: "How do I refresh the API reference?"
    answer: "Run pnpm build, then pnpm docs:api. The verify job fails when docs/api or llms.txt drift."
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

Agent procedures: [AGENTS.md](../AGENTS.md), [skills/](../skills/). Dev container: [.devcontainer/README.md](../.devcontainer/README.md).

License: MIT.
