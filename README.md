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
  <a href="https://www.npmjs.com/package/@adaptate/core"><img alt="npm @adaptate/core" src="https://img.shields.io/npm/v/@adaptate/core?label=%40adaptate%2Fcore&logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/@adaptate/core"><img alt="downloads per month" src="https://img.shields.io/npm/dm/@adaptate/core?logo=npm&label=downloads%2Fmonth"></a>
  <a href="https://bundlephobia.com/package/@adaptate/core"><img alt="minzipped size" src="https://img.shields.io/bundlephobia/minzip/@adaptate/core?label=minzipped"></a>
  <a href="https://www.npmjs.com/package/@adaptate/core"><img alt="types included" src="https://img.shields.io/npm/types/@adaptate/core"></a>
  <a href="https://github.com/p10ns11y/adaptate/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/p10ns11y/adaptate/ci.yml?branch=main&logo=github&label=CI"></a>
  <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/npm/l/@adaptate/core?color=blue"></a>
  <a href="https://github.com/p10ns11y/adaptate/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/p10ns11y/adaptate?style=flat&logo=github"></a>
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

## Design

One walk of the schema. [DESIGN.md](DESIGN.md) records O(N) time and O(D) space. A partial JSON stream scans each new character once. [Incremental partial JSON](docs/incremental-parser.md)

## Measured

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/perf-dark.svg">
    <img alt="Node v24.22.3. Full-document validations per second: raw Zod 2,455,728, Adaptate 2,294,074, Valibot 480,429. Import median milliseconds: 39.542, 41.353, 6.031. Heap after GC bytes: 8,293,200, 8,426,872, 5,204,232. Package min and gzip bytes with zod external: . 2,490 and 1,207, ./stream 4,397 and 1,999, ./standard 589 and 328, ./effect 4,340 and 1,789. Parsed partial microseconds per chunk: 0.605, 0.840, 1.407. AG-UI microseconds per chunk: 0.605, 17.137, 1.407." src="assets/perf.svg" width="960">
  </picture>
</p>

Node v24.22.3. One `node bench/ab/run.js`. Parsed partial 0.840 µs/chunk against raw Zod 0.605 µs/chunk. AG-UI 17.137 µs/chunk. [Performance](docs/performance.md)

## Why trust it

The lines above are about the check being right. [Proof](docs/proof.md) · [CI](https://github.com/p10ns11y/adaptate/actions/workflows/ci.yml)

[Views](docs/transform.md) · [Streaming](docs/streaming.md) · [OpenAPI](docs/openapi.md) · [Effect](docs/effect.md) · [Peers and subpaths](docs/subpaths.md)

MIT
