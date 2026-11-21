# Streaming

`@adaptate/core/stream` checks a partial document against each named config while text is still arriving. `zod` is the only peer.

`parsePartialJson(text)` closes open strings, objects, and arrays, then `JSON.parse`s the longest prefix that parses. It returns `undefined` when nothing parses.

`createStreamValidator(schema, configs)` builds the schemas it can at creation:

- `partial(value)` checks the value with one lenient schema cached on the base schema object (`WeakMap`). Absent fields stay optional. Present fields are still type-checked. Every named config receives that same check. Editing a config does not change `partial`, because a missing field stays optional for every config.
- `final(value)` runs `transformSchema(schema, config).safeParse(value)` for every named config and returns `{ valid, errors }` per name. This `final` takes a value, not text. Those transformed schemas are built when the validator is created and then reused. The lenient partial schema is cached on the base schema object with a `WeakMap`, so it is collected with that schema. Config objects are read at creation: editing one afterward leaves the schema that was already built. A config that cannot be transformed fails inside `final`, not while the validator is constructed. `transformSchema` itself still builds a schema on every direct call.

`validateStructuredOutput({ partial, final }, schema, configs)` runs those two methods when the corresponding field is not `null`.

`createAgUiPartialValidator(schema, configs)` returns a push function. It appends `delta` to a buffer keyed by `toolCallId` for `TOOL_CALL_ARGS` and by `messageId` for `TEXT_MESSAGE_CONTENT`. Each push runs `parsePartialJson` on that buffer and then `partial`. Other event types return `undefined`. The push time includes JSON repair and the partial check. On the grocery-order workload, re-closing the buffer is the repair: most chunks parse on the first close, and the rest need a few shorter prefixes. `JSON.parse` of that text is the repair cost, so a second bracket scan over the new characters does not replace it.

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
