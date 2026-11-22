---
title: "Effect"
description: "Run the same checks in an Effect pipeline. Effect is an optional peer."
answer: "@adaptate/core/effect runs the same adaptate checks inside an Effect pipeline. createEffectStreamValidator returns effects that fail with AdaptateParseError or AdaptateValidationError. effect is an optional peer."
faq:
  - question: "Does importing @adaptate/core load effect?"
    answer: "No. Only @adaptate/core/effect imports effect."
  - question: "Does an unmet config fail final(text)?"
    answer: "No. final(text) reports { valid, issues } per config. final(text, configName) fails when that config is not met."
---

# Effect

`@adaptate/core/effect` needs the optional peer `effect@^4.0.0`. Importing `@adaptate/core` or `@adaptate/core/stream` does not load `effect`. Validation is not retried.

```ts
import { Effect } from "effect";
import { z } from "zod";
import { createEffectStreamValidator } from "@adaptate/core/effect";

const recipe = z.object({
  title: z.string().optional(),
  servings: z.number().optional(),
});
const validator = createEffectStreamValidator(recipe, {
  card: { title: true },
  kitchen: { servings: true },
});

const report = Effect.runSync(validator.final('{"title":"Pasta"}'));
// report.value is { title: "Pasta" }
// report.configs.card is { valid: true, issues: null }
// report.configs.kitchen.valid is false

const card = Effect.runSync(validator.final('{"title":"Pasta"}', "card"));
// { title: "Pasta" }
```

`createEffectStreamValidator` builds the per-config `transformSchema` results when the validator is created, and `final(text)` reuses them. The lenient partial schema is cached on the base schema at the first partial check. A schema that cannot be transformed, such as `z.string()`, still fails inside `final` with `configName: "schema"`. Config objects are read at creation. `final(text, configName)` calls `transformSchema` for that config.

`final(text)` parses with `JSON.parse`. Bad or truncated text fails with `AdaptateParseError`. The base schema is then parsed; that failure is `AdaptateValidationError` with `configName: "schema"`. On success the effect succeeds with `{ value, configs }`. Each named config is `{ valid, issues }`. An unmet config does not fail the effect. A mutated config is read by value on the next `final`.

`final(text, configName)` parses, then validates with `transformSchema(schema, configs[configName])`. Failure is `AdaptateValidationError` with that `configName`. Success is the parsed value. `configName` is typed as `keyof` the configs object. If the runtime name is not an own key of `configs`, the effect fails with `AdaptateValidationError` and one custom issue, `unknown config`, instead of validating the base schema. A mutated config is read on this path, because this path calls `transformSchema` again.

`validate(schema, config, value)` is `transformSchema(schema, config).parse`, failing as `AdaptateValidationError` with `configName: "config"`.

`validatePartial(schema, configs, partial)` fails on the first config that has errors, keeping that config's Zod issues. A thrown `ZodError` is kept as issues. Any other thrown cause becomes one custom issue with the error message.

`partial(value)` is the lenient stream report. `agUi(event)` and `agUiStream(events)` wrap `createAgUiPartialValidator` from `@adaptate/core/stream`. That path appends to a buffer and calls `parsePartialJson`. It does not load `@adaptate/core/stream-incremental`. Pass a third argument, `makeFeed`, and those two methods call that feed instead. Omit it and they keep the re-parse feed.

## A typechecked example

The site tests run this file with `Effect.runPromise`. A missing title falls back on `AdaptateValidationError`. Truncated JSON still fails with `AdaptateParseError`.

<!-- snippet: usages/effect.ts -->
```ts
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
```
<!-- /snippet -->
