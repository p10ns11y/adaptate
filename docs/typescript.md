---
title: "TypeScript"
description: "Types ship in the npm package. CI checks them on TypeScript 7 and 6."
---

# TypeScript

The published packages include their `.d.ts` files. A value's type is inferred from the Zod schema you pass in.

```ts
import { z } from "zod";
import { transformSchema, type Config } from "@adaptate/core";

const recipe = z.object({ title: z.string(), servings: z.number() });
type Recipe = z.infer<typeof recipe>;
const card = { title: true } satisfies Config<Recipe>;
const cardSchema = transformSchema(recipe.partial(), card);
```

`scripts/ts-consumer-check.mjs` packs `@adaptate/core` and `@adaptate/utils`, installs the tarballs, and typechecks a consumer that imports every published entry.

The CI job `ts7-consumer` runs that script on TypeScript 7 and TypeScript 6, each with `moduleResolution` `bundler`, `node16`, and `nodenext`.

Dev TypeScript in this repo is 7.0.2. Lint is `oxlint --type-aware` (`oxlint-tsgolint`), including `typescript/no-deprecated`.
