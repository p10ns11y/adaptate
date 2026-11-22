---
title: "Type Alias: Config\\<T\\>"
description: "Type-safe configuration for `transformSchema` and conditional transformers."
---

# Type Alias: Config\<T\>

> **Config**\<`T`\> = `boolean` \| `unknown` *extends* `T` ? `object` & `object` : `T` *extends* readonly infer U[] ? `object` : `T` *extends* `object` ? `{ [K in keyof T]?: Config<T[K]> }` : `never`

Type-safe configuration for `transformSchema` and conditional transformers.

## High-value use cases this type enables:
- Full autocomplete for every field path in your schema
- Compile-time errors for typos or non-existent fields
- Natural support for deeply nested objects
- Special `'*'` syntax for array element configuration
- `true` = make required, `false` = keep optional (or omit)

## Type Parameters

### T

`T` = `unknown`

## Example

```ts
const config = {
  name: true,
  address: { city: true, country: false },
  tags: { '*': true },
} satisfies Config<z.infer<typeof mySchema>>;
```
