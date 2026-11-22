import { Effect } from "effect";
import { createEffectStreamValidator } from "@adaptate/core/effect";
import { z } from "zod";

let recipe = z.object({
  title: z.string().optional(),
  servings: z.number().optional(),
});

export let recipeValidator = createEffectStreamValidator(recipe, {
  card: { title: true },
  kitchen: { servings: true },
});

export function finalReport(text: string) {
  return Effect.runPromise(recipeValidator.final(text));
}

export function cardOrFallback(text: string) {
  return Effect.runPromise(
    recipeValidator.final(text, "card").pipe(
      Effect.catchTag("AdaptateValidationError", () => Effect.succeed({ title: "Untitled" })),
    ),
  );
}
