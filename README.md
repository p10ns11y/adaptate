<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img alt="Adaptate" src="assets/logo.svg" width="280">
  </picture>
</p>

<p align="center">
  <strong>One schema. Each part of the app checks only the fields it uses.</strong>
  <br>
  A screen, a form, an API client, or a stream.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/adaptate"><img alt="npm adaptate" src="https://img.shields.io/npm/v/adaptate?label=adaptate&logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@adaptate/core"><img alt="npm @adaptate/core" src="https://img.shields.io/npm/v/@adaptate/core?label=%40adaptate%2Fcore&logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@adaptate/utils"><img alt="npm @adaptate/utils" src="https://img.shields.io/npm/v/@adaptate/utils?label=%40adaptate%2Futils&logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@adaptate/core"><img alt="downloads per month" src="https://img.shields.io/npm/dm/@adaptate/core?logo=npm&label=downloads%2Fmonth"></a>
  <a href="https://www.npmjs.com/package/@adaptate/core"><img alt="types included" src="https://img.shields.io/npm/types/@adaptate/core"></a>
</p>

<p align="center">
  <a href="https://github.com/p10ns11y/adaptate/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/p10ns11y/adaptate/ci.yml?branch=main&logo=github&label=CI"></a>
  <a href="./coverage"><img alt="coverage" src="./coverage-badge.svg"></a>
  <a href="https://socket.dev/npm/package/adaptate/overview"><img alt="Socket.dev supply chain" src="https://img.shields.io/badge/socket.dev-supply%20chain-1f6feb"></a>
  <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/npm/l/@adaptate/core?color=blue"></a>
  <a href="./tsconfig.json"><img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white"></a>
  <a href="https://nodejs.org"><img alt="Node.js version" src="https://img.shields.io/node/v/@adaptate/core?logo=node.js&logoColor=white"></a>
  <a href="https://zod.dev"><img alt="zod peer" src="https://img.shields.io/badge/zod-%5E3.25.0%20%7C%7C%20%5E4.0.0-3b82f6?logo=zod&logoColor=white"></a>
  <a href="https://github.com/p10ns11y/adaptate/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/p10ns11y/adaptate?logo=github"></a>
  <a href="https://github.com/p10ns11y/adaptate/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/p10ns11y/adaptate?logo=github"></a>
  <a href="https://github.com/p10ns11y/adaptate/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/p10ns11y/adaptate?style=flat&logo=github"></a>
  <a href="./.devcontainer/README.md"><img alt="dev container" src="https://img.shields.io/badge/dev%20container-ready-2496ED?logo=docker&logoColor=white"></a>
</p>

<p align="center">
  <a href="https://github.com/p10ns11y/adaptate/stargazers"><strong>Star</strong></a>
  &nbsp;·&nbsp;
  <a href="examples/react-view"><strong>React view</strong></a>
  &nbsp;·&nbsp;
  <a href="https://stackblitz.com/github/p10ns11y/adaptate/tree/main/examples/streaming-tool-call"><strong>Try the stream in the browser</strong></a>
</p>

## What it's for

- A React component checks the fields it renders. A Vue, Svelte, or Solid component can call `transformSchema` the same way. The runnable example is [examples/react-view](examples/react-view).
- A form can require the fields collected so far and leave the rest optional.
- An API response is the same check. An OpenAPI write-up can become the Zod schema, and a Zod schema can be written back out.
- A config names the fields each view requires.
- A chat can check a tool call while the model is still typing.

## Quick start

```sh
pnpm add @adaptate/core zod
```

```ts
import { z } from "zod";
import { transformSchema } from "@adaptate/core";

const recipe = z.object({ title: z.string(), servings: z.number() });
const card = transformSchema(recipe.partial(), { title: true });
card.parse({ title: "Pasta" });
```

## In a component

`useViewSchema` keeps that check in a hook. `recipeSchema` is the shared recipe with every field optional. The card requires the title. The kitchen component in the same file also requires how many people, so a title alone passes the card and fails the kitchen.

```jsx
let cardConfig = { title: true };

function useViewSchema(schema, config) {
  return useMemo(() => transformSchema(schema, config), [schema, config]);
}

function RecipeCard({ recipe }) {
  let cardSchema = useViewSchema(recipeSchema, cardConfig);
  let parsed = cardSchema.safeParse(recipe);
  if (!parsed.success) return <p>The card is not ready.</p>;
  return <p>{parsed.data.title}</p>;
}
```

## A stream is one case

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/stream-demo-dark.gif">
    <img alt="One recipe feeds a card and a kitchen screen. With only the dish name, the card is ready and the kitchen is not. When the number of servings arrives, the kitchen is ready too." src="assets/stream-demo.gif" width="760">
  </picture>
</p>

One case: a reply that is still arriving. The card checks the dish name. The kitchen also needs how many people. The model has sent `{"title":"Pas` so far.

<table>
<tr>
<th width="50%">Without Adaptate</th>
<th width="50%">With Adaptate</th>
</tr>
<tr>
<td valign="top">
<pre><code>const args = '{"title":"Pas';
JSON.parse(args);</code></pre>
<code>JSON.parse</code> throws. The card stays blank.
</td>
<td valign="top">
<pre><code>const check = push({
  type: "TOOL_CALL_ARGS",
  toolCallId: "call-1",
  delta: '{"title":"Pas',
});</code></pre>
<code>check.partial</code> is <code>{ title: "Pas" }</code>. The card check passes.
</td>
</tr>
</table>

`push` comes from `@adaptate/core/stream`. Run it in [examples/streaming-tool-call](examples/streaming-tool-call).

## TypeScript

The types ship in the package. A value's type is inferred from the Zod schema you write.

```ts
import { z } from "zod";
import { transformSchema, type Config } from "@adaptate/core";

const recipe = z.object({ title: z.string(), servings: z.number() });
type Recipe = z.infer<typeof recipe>;
const card = { title: true } satisfies Config<Recipe>;
const cardSchema = transformSchema(recipe.partial(), card);
```

CI checks those published types on TypeScript 7 and 6, for `bundler`, `node16`, and `nodenext`. [TypeScript](docs/typescript.md)

## Measured

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/perf-dark.svg">
    <img alt="Node v24.22.3 on GitHub Actions. Full-document validations per second: raw Zod 3,512,914, Adaptate 3,302,796, Valibot 694,396. Import median milliseconds: 35.288, 36.886, 5.209. Heap after GC bytes: 8,292,224, 8,424,424, 5,204,896. Package min and gzip bytes with zod external: . 2,490 and 1,207, ./stream 4,278 and 1,927, ./standard 589 and 328, ./effect 4,221 and 1,713. Parsed partial microseconds per chunk: 0.433, 0.667, 0.926. AG-UI microseconds per chunk: 0.433, 24.084, 0.926." src="assets/perf.svg" width="960">
  </picture>
</p>

Node v24.22.3 on the GitHub Actions runner. Commit [`233b1ef`](https://github.com/p10ns11y/adaptate/commit/233b1ef17f994088cc5687c0c5ea61ff7a7751a9). Run [ab-eval 44956631113](https://github.com/p10ns11y/adaptate/actions/runs/44956631113). [Performance](docs/performance.md)

## Why trust it

The lines above are about the check being right. The chart is that one run. [Proof](docs/proof.md) · [CI](https://github.com/p10ns11y/adaptate/actions/workflows/ci.yml)

[Docs](docs/index.md) · [Views](docs/transform.md) · [Streaming](docs/streaming.md) · [OpenAPI](docs/openapi.md) · [Effect](docs/effect.md) · [API](docs/api/index.md)

MIT
