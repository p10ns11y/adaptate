---
title: "Docs"
description: "Where to read about views, streaming, OpenAPI, types, and the generated API."
---

# Docs

One description. Each screen checks only what it shows. A cut-off reply does not throw.

The pages below stay in this folder so a later docs site can pick them up. Each page has a `title` and a `description`. [llms.txt](../llms.txt) lists them for agents. [llms-full.txt](../llms-full.txt) contains the page text.

## Guides

- [Transform](transform.md): one Zod schema, and a config that marks which fields each screen requires.
- [Streaming](streaming.md): check a tool call while the JSON is still arriving.
- [OpenAPI](openapi.md): turn an OpenAPI schema into Zod, and write a Zod schema back out.
- [Effect](effect.md): run the same checks in an Effect pipeline.
- [TypeScript](typescript.md): types ship in the package and are checked on TypeScript 7 and 6.
- [Subpaths](subpaths.md): the published entry points, and which peers each one loads.
- [Optional peers](optional-peers.md): effect, js-yaml, and the ref parser load only when that code is imported.
- [Performance](performance.md): measured cost of import, a full document, and a streaming check.
- [Proof](proof.md): each front-page sentence mapped to a test, a script, or a CI job.
- [Migration 2.4](migration-2.4.md): YAML and the ref parser became optional peers.
- [Development](development.md): install, test, and build this repository.

## API

- [API reference](api/index.md): generated from the `.d.ts` files that ship in the packages.
