---
title: "Zod"
description: "Use one Zod schema with a Config per view, and check it through the Standard Schema interface."
answer: "Write one Zod schema, then give each view a Config that marks the fields it needs. transformSchema(schema.partial(), config) returns a Zod schema for that view, and validateStandard checks it through ~standard."
faq:
  - question: "Which Zod versions are supported?"
    answer: "zod ^3.25.0 or ^4.0.0, as a peer dependency."
  - question: "Is the result still a Zod schema?"
    answer: "Yes. It has parse, safeParse, and the ~standard interface, so any Standard Schema consumer can use it."
  - question: "How does Config catch mistakes?"
    answer: "Config<T> only accepts field paths that exist on T, so a typo fails at compile time."
---

# Zod

One schema describes the data. Each view states which fields it needs. A title alone passes the card and fails the kitchen.

```mermaid
flowchart LR
  Schema["recipe schema"] --> Partial["schema.partial()"]
  Partial -->|"card config"| Card["card schema"]
  Partial -->|"kitchen config"| Kitchen["kitchen schema"]
  Card --> Standard["~standard validate"]
```

```ts
import { z } from "zod";
import { transformSchema } from "@adaptate/core";

const recipe = z.object({ title: z.string(), servings: z.number() });
transformSchema(recipe.partial(), { title: true }).parse({ title: "Pas" });
```

The file below is typechecked and run by the site tests.

<!-- snippet: usages/zod.ts -->
```ts
import { transformSchema, type Config } from "@adaptate/core";
import { validateStandard } from "@adaptate/core/standard";
import { z } from "zod";

export let recipeSchema = z.object({
  title: z.string(),
  servings: z.number(),
});

export type Recipe = z.infer<typeof recipeSchema>;

export let cardConfig = { title: true } satisfies Config<Recipe>;
export let kitchenConfig = { title: true, servings: true } satisfies Config<Recipe>;

export let cardSchema = transformSchema(recipeSchema.partial(), cardConfig);
export let kitchenSchema = transformSchema(recipeSchema.partial(), kitchenConfig);

export function readyViews(recipe: Partial<Recipe>) {
  return {
    card: cardSchema.safeParse(recipe).success,
    kitchen: kitchenSchema.safeParse(recipe).success,
  };
}

export async function checkWithStandardSchema(recipe: unknown) {
  return validateStandard(cardSchema, recipe);
}
```
<!-- /snippet -->

`validateStandard` comes from `@adaptate/core/standard`. It accepts any schema with `~standard.validate`, so a valibot or ArkType schema works the same way. See [Transform](transform.md) for config values and [TypeScript](typescript.md) for the published types.
