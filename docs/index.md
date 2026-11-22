---
title: "Docs"
description: "Where to read about views, streaming, OpenAPI, types, and the generated API."
answer: "adaptate docs cover views, streaming, OpenAPI, Zod, Effect, web streams, TypeScript, and an API reference generated from the published declaration files."
faq:
  - question: "Where do I start?"
    answer: "Start with Transform for one schema and a config per view. Read Streaming next if a model sends JSON tool calls."
  - question: "Is the API reference generated?"
    answer: "Yes. pnpm docs:api writes docs/api from the .d.ts files that ship in @adaptate/core and @adaptate/utils."
---

# Docs

One schema. Each part of the app checks only the fields it uses. A screen, a form, an API client, or a stream.

A React component that checks its own view is [examples/react-view](../examples/react-view). Vue, Svelte, and Solid can call `transformSchema` the same way. This repository includes the React example.

The site builds these pages into /docs/. Each page has a `title` and a `description`. [llms.txt](../llms.txt) lists them for agents. [llms-full.txt](../llms-full.txt) contains the page text.

## Guides

- [Transform](transform.md): one Zod schema, and a config that marks which fields each screen requires.
- [Streaming](streaming.md): check a tool call while the JSON is still arriving.
- [Incremental partial JSON](incremental-parser.md): scan each new character of a JSON stream once.
- [AG-UI](ag-ui.md): check AG-UI tool-call deltas against each view.
- [Web streams](web-streams.md): feed a ReadableStream, SSE, or a Node stream into the parser.
- [OpenAPI](openapi.md): turn an OpenAPI schema into Zod, and write a Zod schema back out.
- [Zod](zod.md): one Zod schema, a `Config` per view, and the Standard Schema interface.
- [Effect](effect.md): run the same checks in an Effect pipeline.
- [TypeScript](typescript.md): types ship in the package and are checked on TypeScript 7 and 6.
- [Subpaths](subpaths.md): the published entry points, and which peers each one loads.
- [Optional peers](optional-peers.md): effect, js-yaml, and the ref parser load only when that code is imported.
- [Performance](performance.md): measured cost of import, a full document, four component views, a streaming check, and bundle size.
- [Proof](proof.md): each front-page sentence mapped to a test, a script, or a CI job.
- [Migration 2.4](migration-2.4.md): YAML and the ref parser became optional peers.
- [Development](development.md): install, test, and build this repository.

## API

- [API reference](api/index.md): generated from the `.d.ts` files that ship in the packages.
