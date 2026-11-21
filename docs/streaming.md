# Streaming

`@adaptate/core/stream` checks a partial document against each named config while text is still arriving. `zod` is the only peer.

`parsePartialJson(text)` closes open strings, objects, and arrays, then `JSON.parse`s the longest prefix that parses. It returns `undefined` when nothing parses.

`createStreamValidator(schema, configs)`:

- `partial(value)` runs `validatePartialAgainstConfigs`. Absent fields stay optional. Present fields are still type-checked.
- `final(value)` runs `transformSchema(schema, config).safeParse(value)` for every named config and returns `{ valid, errors }` per name. This `final` takes a value, not text.

`validateStructuredOutput({ partial, final }, schema, configs)` runs those two methods when the corresponding field is not `null`.

`createAgUiPartialValidator(schema, configs)` returns a push function. It appends `delta` to a buffer keyed by `toolCallId` for `TOOL_CALL_ARGS` and by `messageId` for `TEXT_MESSAGE_CONTENT`. Each push runs `parsePartialJson` on that buffer and then `partial`. Other event types return `undefined`.

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
