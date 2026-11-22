---
title: "Transform"
description: "One Zod schema, and a config that marks which fields each screen requires."
answer: "transformSchema(schema, config) returns a Zod schema where the fields marked true in the config are required. Fields the config does not mention keep their original optionality."
faq:
  - question: "What does transformSchema return?"
    answer: "A Zod schema. The configured fields are required and every other field stays as it was."
  - question: "How do I require a field on every array item?"
    answer: "Use the '*' key, for example { tags: { '*': true } }."
  - question: "How do I require a field only in some cases?"
    answer: "Use makeConditionalSchemaTransformer(data)(schema, config) with requiredIf: (data) => boolean."
---

# Transform

`transformSchema(schema, config)` returns a Zod schema with the configured fields required. Unmentioned fields stay as they were.

Config values:

- `true` — strip optionality
- `false` — keep the field optional
- nested object — recurse
- `{ '*': config }` — apply `config` to each array element
- `(data) => boolean` or `{ requiredIf: (data) => boolean }` — with `makeConditionalSchemaTransformer` only

```ts
import { z } from "zod";
import { transformSchema, type Config } from "@adaptate/core";

const schema = z.deepPartial(
  z.object({
    name: z.string(),
    age: z.number(),
    address: z.object({
      street: z.string(),
      city: z.string(),
    }),
  }),
);

const config = {
  name: true,
  age: true,
  address: { city: true },
} satisfies Config<z.infer<typeof schema>>;

const updatedSchema = transformSchema(schema, config);
updatedSchema.parse({ name: "Davin", age: 30, address: { city: "Pettit" } });
const streetOnly = updatedSchema.safeParse({
  name: "Davin",
  age: 30,
  address: { street: "Main St" },
});
```

`streetOnly.success` is false: `city` is required.

Zod 4 exports `z.deepPartial`. The object method `.deepPartial()` is the Zod 3 method. The same config works when each field is written with `.optional()` instead of `z.deepPartial`.

`Config<T>` checks field paths at compile time, including `'*'` on arrays:

```ts
import { z } from "zod";
import { type Config } from "@adaptate/core";

const userSchema = z.object({
  name: z.string(),
  address: z.object({ street: z.string(), city: z.string() }),
  tags: z.array(z.string()),
});

const config = {
  name: true,
  address: { city: true },
  tags: { "*": true },
} satisfies Config<z.infer<typeof userSchema>>;
```

`makeConditionalSchemaTransformer(data)(schema, config)` applies `requiredIf` against that `data`.

```ts
import { z } from "zod";
import { makeConditionalSchemaTransformer } from "@adaptate/core";

const schema = z.object({
  parentContactNumber: z.number().optional(),
  age: z.number().optional(),
});
const config = {
  parentContactNumber: { requiredIf: (data: { age?: number }) => (data.age ?? 0) < 18 },
  age: true,
};
const transformer = makeConditionalSchemaTransformer({ age: 17 })(schema, config);
transformer.run(); // throws: parentContactNumber is required
```

- `transformer.schema` — the transformed Zod schema
- `transformer.run()` — `transformer.schema.parse(data)`
- `transformer.staticConfig` — the config with conditionals removed, for `transformSchema`

Traversal, from `packages/core/src/index.ts`:

1. An optional field is unwrapped with `.unwrap()`.
2. Nested objects recurse with the nested config.
3. An array `'*'` config is applied to the element schema.
4. The new shape is copied back with object spread into `z.object`.

Fields absent from the config are kept.
