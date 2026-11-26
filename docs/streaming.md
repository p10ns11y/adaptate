---
title: "Streaming"
description: "Check a tool call while the JSON is still arriving."
answer: "@adaptate/core/stream checks a partial JSON document against each named config while text is still arriving. createAgUiPartialValidator turns AG-UI deltas into a partial value and a per-config result."
faq:
  - question: "What happens when a chunk cuts a string in half?"
    answer: "parsePartialJson closes the open string, objects, and arrays, so {\"title\":\"Pas becomes { title: \"Pas\" }."
  - question: "Does partial checking reject missing fields?"
    answer: "No. partial(value) keeps absent fields optional and still type-checks the fields that are present."
  - question: "Which peer does it need?"
    answer: "Only zod, version ^3.25.0 or ^4.0.0."
---

# Streaming

`@adaptate/core/stream` checks a partial document against each named config while text is still arriving. `zod` is the only peer.

`parsePartialJson(text)` closes open strings, objects, and arrays, then `JSON.parse`s the longest prefix that parses. It returns `undefined` when nothing parses.

`createStreamValidator(schema, configs)` builds the schemas it can at creation:

- `partial(value)` checks the value with one lenient schema cached on the base schema object (`WeakMap`). The cache is filled on the first partial check, not when the validator is constructed, so a strict schema built from the same fields is left alone. Building that lenient schema does not parse the source object or array. Absent fields stay optional. Present fields are still type-checked. Every named config receives that same check. Editing a config does not change `partial`, because a missing field stays optional for every config.
- `final(value)` runs `transformSchema(schema, config).safeParse(value)` for every named config and returns `{ valid, errors }` per name. This `final` takes a value, not text. Those transformed schemas are built when the validator is created and then reused. The lenient partial schema is cached on the base schema object with a `WeakMap`, so it is collected with that schema. Config objects are read at creation: editing one afterward leaves the schema that was already built. A config that cannot be transformed fails inside `final`, not while the validator is constructed. `transformSchema` itself still builds a schema on every direct call.

`validateStructuredOutput({ partial, final }, schema, configs)` runs those two methods when the corresponding field is not `null`.

`createAgUiPartialValidator(schema, configs)` returns a push function. It appends `delta` to a buffer keyed by `toolCallId` for `TOOL_CALL_ARGS` and by `messageId` for `TEXT_MESSAGE_CONTENT`, then calls `parsePartialJson` on that buffer. A parsed value is checked with `partial`. A chunk that does not parse returns `undefined`. `TOOL_CALL_END` and `TEXT_MESSAGE_END` drop that id. `push.close(id)` drops it too. The same name on `@adaptate/core/stream-incremental` tokenizes each chunk once through `createPartialJsonFeed`.

```ts
import { z } from "zod";
import { createAgUiPartialValidator } from "@adaptate/core/stream";

const recipe = z.object({
  title: z.string().optional(),
  servings: z.number().optional(),
});
const push = createAgUiPartialValidator(recipe, {
  card: { title: true },
});
push({
  type: "TOOL_CALL_ARGS",
  toolCallId: "call-1",
  delta: '{"title":"Pas',
});
```

Streams partial JSON without re-reading what it already saw. The run metadata and the per-chunk numbers are in [Performance](performance.md#measured).

In v3, `fromAsyncIterableSteps` and `parseStream` accept an optional `makeFeed` hook. [v3 feeds](v3.md).
