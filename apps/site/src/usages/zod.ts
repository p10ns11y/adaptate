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
