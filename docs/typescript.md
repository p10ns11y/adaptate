---
title: "TypeScript"
description: "Types ship in the npm package. CI checks them on TypeScript 7 and 6."
answer: "The adaptate packages ship their .d.ts files. Value types are inferred from the Zod schema, and CI typechecks the packed tarballs on TypeScript 7 and 6 with bundler, node16, and nodenext resolution."
faq:
  - question: "Do I need @types packages?"
    answer: "No. Types ship inside @adaptate/core and @adaptate/utils."
  - question: "Is Config type-checked?"
    answer: "Yes. Config<T> checks field paths at compile time, including '*' on arrays."
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
