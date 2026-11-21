import { useMemo } from "react";
import { z } from "zod";
import { transformSchema } from "@adaptate/core";

export let recipeSchema = z
  .object({
    title: z.string(),
    servings: z.number(),
  })
  .partial();

let cardConfig = { title: true };
let kitchenConfig = { title: true, servings: true };

export function useViewSchema(schema, config) {
  return useMemo(() => transformSchema(schema, config), [schema, config]);
}

export function RecipeCard({ recipe }) {
  let cardSchema = useViewSchema(recipeSchema, cardConfig);
  let parsed = cardSchema.safeParse(recipe);
  if (!parsed.success) {
    return <p>The card is not ready.</p>;
  }
  return <p>{parsed.data.title}</p>;
}

export function RecipeKitchen({ recipe }) {
  let kitchenSchema = useViewSchema(recipeSchema, kitchenConfig);
  let parsed = kitchenSchema.safeParse(recipe);
  if (!parsed.success) {
    return <p>The kitchen is not ready.</p>;
  }
  return <p>{String(parsed.data.servings)}</p>;
}
