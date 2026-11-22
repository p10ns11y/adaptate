---
title: "Function: transformSchema()"
description: "Make fields required/optional based on config. Returns a properly typed Zod schema."
---

# Function: transformSchema()

> **transformSchema**\<`TSchema`, `TConfig`\>(`schema`, `config`): `TSchema`

Make fields required/optional based on config.
Returns a properly typed Zod schema.

## Type Parameters

### TSchema

`TSchema` *extends* `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>

### TConfig

`TConfig` *extends* `boolean` \| `object` & `object` \| \{ `*?`: [`Config`](../type-aliases/Config.md)\<`unknown`\>; \} \| \{ \}

## Parameters

### schema

`TSchema`

### config

`TConfig`

## Returns

`TSchema`
