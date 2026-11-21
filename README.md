# Adaptate

[![npm: @adaptate/core](https://img.shields.io/npm/v/@adaptate/core?label=%40adaptate%2Fcore&logo=npm&color=cb3837)](https://www.npmjs.com/package/@adaptate/core)
[![downloads / month](https://img.shields.io/npm/dm/@adaptate/core?logo=npm&label=downloads%2Fmonth)](https://www.npmjs.com/package/@adaptate/core)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@adaptate/core?label=minzipped)](https://bundlephobia.com/package/@adaptate/core)
[![types: included](https://img.shields.io/npm/types/@adaptate/core)](https://www.npmjs.com/package/@adaptate/core)
[![CI](https://img.shields.io/github/actions/workflow/status/p10ns11y/adaptate/ci.yml?branch=main&logo=github&label=CI)](https://github.com/p10ns11y/adaptate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/npm/l/@adaptate/core?color=blue)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/p10ns11y/adaptate?style=flat&logo=github)](https://github.com/p10ns11y/adaptate/stargazers)

**See which screen can use an AI reply before the model finishes typing.**

- You describe the data once. Every screen shares that description.
- Each screen asks only for the fields it actually shows.
- While the reply is still arriving, a screen turns ready as soon as it has enough.

![One recipe splits into a card and a kitchen screen. The card turns ready when the title arrives. The kitchen turns ready when the number of servings arrives.](assets/stream-demo.gif)

![The same recipe feeds a card that is ready and a kitchen that is still waiting.](assets/one-schema.svg)

## Try it

```sh
pnpm add @adaptate/core
```

```ts
import { z } from "zod";
import { transformSchema } from "@adaptate/core";

const recipe = z.object({
  title: z.string().optional(),
  servings: z.number().optional(),
});
const card = transformSchema(recipe, { title: true });
card.parse({ title: "Pasta" });
```

## Where it helps

- A card can show the dish name while the kitchen still waits for how many people it serves.
- A chat can check a tool call while the model is still typing.
- An API write-up can become those checks, and the checks can be written back out.
- The same checks run in ordinary code or in an Effect pipeline.

[Proof](docs/proof.md)

[Views](docs/transform.md) · [Streaming](docs/streaming.md) · [OpenAPI](docs/openapi.md) · [Effect](docs/effect.md) · [Peers and subpaths](docs/subpaths.md)

MIT
