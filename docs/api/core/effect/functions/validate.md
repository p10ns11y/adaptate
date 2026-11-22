---
title: "Function: validate()"
description: "Exported from @adaptate/core/effect."
---

# Function: validate()

> **validate**\<`TSchema`, `TConfig`\>(`schema`, `config`, `value`): `Effect`\<`output`\<`TSchema`\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md)\>

## Type Parameters

### TSchema

`TSchema` *extends* `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>

### TConfig

`TConfig` *extends* `boolean` \| \{ `*?`: [`Config`](../../index/type-aliases/Config.md)\<`unknown`\>; \} \| \{ \} \| `object` & `object`

## Parameters

### schema

`TSchema`

### config

`TConfig`

### value

`unknown`

## Returns

`Effect`\<`output`\<`TSchema`\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md)\>
