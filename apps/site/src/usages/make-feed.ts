import { parseStream } from "@adaptate/core/result";
import {
  createTrackedFeed,
  type TrackedFeed,
} from "@adaptate/core/stream-incremental";
import { z } from "zod";

export let recipe = z.object({
  title: z.string(),
  tags: z.array(z.string()),
});

export async function* chunks() {
  yield '{"title":"Pas';
  yield 'ta","tags":["c1","c';
  yield '2"]}';
}

export function makeFeed(): TrackedFeed {
  let inner = createTrackedFeed();
  return {
    push: (chunk) => inner.push(chunk),
    complete: () => inner.complete(),
    ended: () => inner.ended(),
    openPath: () => inner.openPath(),
    tailOpen: () => inner.tailOpen(),
  };
}

export async function collectRecipeSteps() {
  let steps = [];
  for await (let step of parseStream(
    chunks(),
    recipe,
    recipe.partial(),
    makeFeed,
  )) {
    steps.push({
      done: step.done,
      openPath: step.openPath,
      tailOpen: step.tailOpen,
      ok: step.result.ok,
      value: step.result.ok
        ? step.result.value
        : step.result.error,
    });
  }
  return steps;
}
