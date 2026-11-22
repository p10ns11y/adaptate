---
title: "Function: transformPartialSchema()"
description: "Exported from @adaptate/core."
---

# Function: transformPartialSchema()

> **transformPartialSchema**\<`TSchema`, `TConfig`\>(`schema`, `config`): (`partial`) => `ZodType`\<[`DeepPartial`](../type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>\>

## Type Parameters

### TSchema

`TSchema` *extends* `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>

### TConfig

`TConfig` *extends* `boolean` \| \{ `*?`: [`Config`](../type-aliases/Config.md)\<`unknown`\>; \} \| \{ \} \| `object` & `object`

## Parameters

### schema

`TSchema`

### config

`TConfig`

## Returns

(`partial`) => `ZodType`\<[`DeepPartial`](../type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>\>
