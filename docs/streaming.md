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

```mermaid
flowchart LR
  Chunk["chunk"] --> PartialJson["parsePartialJson"]
  PartialJson --> Partial["partial(value)"]
  Value["complete value"] --> Final["final(value)"]
  Final --> Report["valid and errors per config"]
```

`parsePartialJson(text)` closes open strings, objects, and arrays, then parses the longest prefix. It returns `undefined` when nothing parses.

`createStreamValidator(schema, configs)`:

| Method | What it checks | Cache |
| --- | --- | --- |
| `partial(value)` | Present fields only. Absent fields stay optional. Every named config gets the same check. | Lenient schema on a `WeakMap` of the base schema, filled on first call. |
| `final(value)` | `transformSchema(schema, config).safeParse(value)` per name, returns `{ valid, errors }`. Takes a value, not text. | Transformed schemas built at creation. Later config edits do not change them. A config that cannot be transformed fails inside `final`. |

`validateStructuredOutput({ partial, final }, schema, configs)` runs those methods when the field is not `null`.

`createAgUiPartialValidator(schema, configs)` returns a push function:

| Event | Buffer key | Action |
| --- | --- | --- |
| `TOOL_CALL_ARGS` | `toolCallId` | Append `delta`, parse, then `partial`. |
| `TEXT_MESSAGE_CONTENT` | `messageId` | Same. |
| `TOOL_CALL_END`, `TEXT_MESSAGE_END`, or `push.close(id)` | that id | Drop the buffer. |

A chunk that does not parse returns `undefined`. The same name on `@adaptate/core/stream-incremental` tokenizes each chunk once through `createPartialJsonFeed`.

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

Streams partial JSON without re-reading what it already saw. Numbers: [Performance](performance.md#measured).

In v3, pass `makeFeed` to `fromAsyncIterableSteps` or `parseStream`. Runnable example: [v3 feeds](v3.md).
