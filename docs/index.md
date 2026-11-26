---
title: "Docs"
description: "Typed, validated data from OpenAPI, JSON Schema, or Zod, including JSON that is still streaming."
answer: "Install adaptate, turn an OpenAPI or JSON Schema into Zod, and check data against it, including a tool call that is still streaming. Each view can require only its own fields."
faq:
  - question: "Which package do I install?"
    answer: "adaptate for transformSchema, @adaptate/utils for OpenAPI, and @adaptate/core when you need the /stream, /verify, /standard, or /effect subpaths. zod is a peer. @adaptate/accel, @adaptate/wasm, and @adaptate/native are optional Advanced packages, not part of the default zero-dep install."
  - question: "Is the API reference generated?"
    answer: "Yes. pnpm docs:api writes docs/api from the .d.ts files that ship in @adaptate/core and @adaptate/utils."
---

# Docs

## Install

```sh
npm i adaptate @adaptate/utils zod
```

`adaptate` ships the root entry of `@adaptate/core`. Install `@adaptate/core` instead when you import a subpath such as `@adaptate/core/stream` or `@adaptate/core/verify`. The default install stays zero-dependency aside from the `zod` peer.

## Quick start

An OpenAPI or JSON Schema object becomes a Zod schema:

```ts
import { openAPISchemaToZod } from "@adaptate/utils";

const recipe = openAPISchemaToZod({
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string" },
    servings: { type: "integer" },
  },
});
recipe.safeParse({ title: "Pasta", servings: 4 }).success; // true
```

One Zod schema, and a card that requires only the title:

```ts
import { z } from "zod";
import { transformSchema, type Config } from "adaptate";

const recipe = z.object({ title: z.string(), servings: z.number() });
type Recipe = z.infer<typeof recipe>;
const card = { title: true } satisfies Config<Recipe>;
const cardSchema = transformSchema(recipe.partial(), card);
cardSchema.parse({ title: "Pasta" });
```

Agents can read [llms.txt](../llms.txt) for an index, or [llms-full.txt](../llms-full.txt) for every page.

## Guides

- [Transform](transform.md): one Zod schema, and a config that marks which fields each screen requires.
- [Streaming](streaming.md): check a tool call while the JSON is still arriving.
- [v3 feeds](v3.md): a `makeFeed` hook on stream steps, with `openPath` and `tailOpen` unchanged.
- [AG-UI](ag-ui.md): check AG-UI tool-call deltas against each view.
- [Web streams](web-streams.md): feed a ReadableStream, SSE, or a Node stream into the parser.
- [OpenAPI](openapi.md): turn an OpenAPI schema into Zod, and write a Zod schema back out.
- [Zod](zod.md): one Zod schema, a `Config` per view, and the Standard Schema interface.
- [Effect](effect.md): run the same checks in an Effect pipeline.
- [Find your choke points](choke-points.md): parse to an ok or error track, then map, flatMap, or recover.
- [TypeScript](typescript.md): types ship in the package and are checked on TypeScript 7 and 6.
- [Subpaths](subpaths.md): the published entry points, and which peers each one loads.
- [Optional peers](optional-peers.md): effect, js-yaml, and the ref parser load only when that code is imported.
- [Acceleration](accel.md): optional native, WASM, and GPU packages for large buffers, plus a live JS vs WASM benchmark.
- [Runtime verification](verification.md): fail-closed in-memory hooks before any write to disk.
- [Migration 2.4](migration-2.4.md): YAML and the ref parser became optional peers.
- [Migration 3.0](migration-3.0.md): additive `makeFeed`, `@adaptate/core/verify`, and optional acceleration packages.
- [Development](development.md): install, test, and build this repository.

## API

- [API reference](api/index.md): generated from the `.d.ts` files that ship in the packages.
