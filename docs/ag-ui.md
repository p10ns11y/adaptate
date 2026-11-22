---
title: "AG-UI"
description: "Check AG-UI TOOL_CALL_ARGS deltas against each view while the JSON is still arriving."
answer: "createAgUiPartialValidator(schema, configs) returns a push function. Pass it each AG-UI TOOL_CALL_ARGS or TEXT_MESSAGE_CONTENT event, and it returns the partial value plus a valid flag for every named config."
faq:
  - question: "Which AG-UI events does push read?"
    answer: "TOOL_CALL_ARGS keyed by toolCallId and TEXT_MESSAGE_CONTENT keyed by messageId. TOOL_CALL_END and TEXT_MESSAGE_END drop the buffer for that id."
  - question: "Should I import it from /stream or /stream-incremental?"
    answer: "Both export createAgUiPartialValidator with the same shape. /stream-incremental tokenizes each chunk once, which matters for long tool calls."
  - question: "What does push return for a chunk that does not parse yet?"
    answer: "undefined. The next chunk that completes a value returns a result."
---

# AG-UI

An AG-UI agent streams a tool call as `TOOL_CALL_ARGS` events. Each event carries a `delta` of JSON text. `push` keeps one buffer per `toolCallId` and checks the partial value against every named config.

```mermaid
flowchart LR
  Agent["AG-UI agent"] -->|"TOOL_CALL_ARGS delta"| Push["push(event)"]
  Push --> Buffer["buffer per toolCallId"]
  Buffer --> Partial["partial value"]
  Partial --> Card["card config"]
  Partial --> Kitchen["kitchen config"]
```

```ts
import { z } from "zod";
import { createAgUiPartialValidator } from "@adaptate/core/stream-incremental";

const push = createAgUiPartialValidator(
  z.object({ title: z.string(), servings: z.number() }),
  { card: { title: true } },
);
const check = push({ type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta: '{"title":"Pas' });
```

`check.partial` is `{ title: "Pas" }` and `check.results.card.valid` is `true`. `JSON.parse` on the same text throws.

The file below is typechecked and run by the site tests. It builds the re-parse and incremental validators for one order schema.

<!-- snippet: usages/ag-ui.ts -->
```ts
import { createAgUiPartialValidator as createReparseAgUi } from "@adaptate/core/stream";
import { createAgUiPartialValidator as createIncrementalAgUi } from "@adaptate/core/stream-incremental";

import { cardConfig, orderSchema } from "../order-schema";

export function createReparseOrderValidator() {
  return createReparseAgUi(orderSchema, { card: cardConfig });
}

export function createIncrementalOrderValidator() {
  return createIncrementalAgUi(orderSchema, { card: cardConfig });
}
```
<!-- /snippet -->

The order schema and the card config:

<!-- snippet: order-schema.ts -->
```ts
import type { Config } from "@adaptate/core";
import { z } from "zod";

export let orderSchema = z.object({
  title: z.string(),
  notes: z.string(),
  items: z.array(
    z.object({
      sku: z.string(),
      qty: z.number(),
    }),
  ),
});

export let partialOrderSchema = orderSchema.partial();

export let cardConfig = {
  title: true,
} satisfies Config<z.infer<typeof partialOrderSchema>>;
```
<!-- /snippet -->

See [Streaming](streaming.md) for `partial` and `final`.
