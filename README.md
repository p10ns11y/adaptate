<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
    <img alt="Adaptate" src="assets/logo.svg" width="280">
  </picture>
</p>

<p align="center">
  <strong>One description. Each screen checks only what it shows. A cut-off reply does not throw.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/adaptate"><img alt="npm adaptate" src="https://img.shields.io/npm/v/adaptate?label=adaptate&logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@adaptate/core"><img alt="npm @adaptate/core" src="https://img.shields.io/npm/v/@adaptate/core?label=%40adaptate%2Fcore&logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@adaptate/utils"><img alt="npm @adaptate/utils" src="https://img.shields.io/npm/v/@adaptate/utils?label=%40adaptate%2Futils&logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@adaptate/core"><img alt="downloads per month" src="https://img.shields.io/npm/dm/@adaptate/core?logo=npm&label=downloads%2Fmonth"></a>
  <a href="https://bundlephobia.com/package/@adaptate/core"><img alt="minzipped size" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fbundlephobia.com%2Fapi%2Fsize%3Fpackage%3D%40adaptate%2Fcore&query=$.gzip&label=minzipped&suffix=B"></a>
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
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/stream-demo-dark.gif">
    <img alt="One recipe feeds a card and a kitchen screen. With only the dish name, the card is ready and the kitchen is not. When the number of servings arrives, the kitchen is ready too." src="assets/stream-demo.gif" width="760">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/p10ns11y/adaptate/stargazers"><strong>Star</strong></a>
  &nbsp;·&nbsp;
  <a href="https://stackblitz.com/github/p10ns11y/adaptate/tree/main/examples/streaming-tool-call"><strong>Try it in the browser</strong></a>
</p>

## The same tool call, two ways

The model has sent `{"title":"Pas` so far.

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

`push` is the three-line quick start below. Run it in [examples/streaming-tool-call](examples/streaming-tool-call).

## What it's for

<table>
<tr>
<td width="33%" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/icon-card-dark.svg">
    <img alt="" src="assets/icon-card.svg" width="48" height="48">
  </picture>
  <br>
  A card shows the dish name while the kitchen is not ready yet.
</td>
<td width="33%" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/icon-chat-dark.svg">
    <img alt="" src="assets/icon-chat.svg" width="48" height="48">
  </picture>
  <br>
  A chat checks a tool call while the model is still typing.
</td>
<td width="33%" align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/icon-page-dark.svg">
    <img alt="" src="assets/icon-page.svg" width="48" height="48">
  </picture>
  <br>
  An API write-up becomes those checks, and can be written back out.
</td>
</tr>
</table>

## Quick start

```sh
pnpm add @adaptate/core zod
```

```ts
import { z } from "zod";
import { createAgUiPartialValidator } from "@adaptate/core/stream";
const push = createAgUiPartialValidator(z.object({ title: z.string(), servings: z.number() }), { card: { title: true } });
```

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

## Why trust it

The lines above are about the check being right. With the schema cached, the streaming check is within about 1.5× of raw Zod per chunk (0.667 µs against 0.433 µs, parsed partial). JSON repair is separate, about 23 µs/chunk. [Performance](docs/performance.md) · [Proof](docs/proof.md) · [CI](https://github.com/p10ns11y/adaptate/actions/workflows/ci.yml)

[Docs](docs/index.md) · [Views](docs/transform.md) · [Streaming](docs/streaming.md) · [OpenAPI](docs/openapi.md) · [Effect](docs/effect.md) · [API](docs/api/index.md)

MIT
