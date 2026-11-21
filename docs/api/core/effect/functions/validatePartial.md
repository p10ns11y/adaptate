---
title: "Function: validatePartial()"
description: "Exported from @adaptate/core/effect."
---

# Function: validatePartial()

> **validatePartial**\<`TSchema`, `TConfigs`\>(`schema`, `configs`, `partial`): `Effect`\<[`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md)\>

## Type Parameters

### TSchema

`TSchema` *extends* `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>

### TConfigs

`TConfigs` *extends* `Record`\<`string`, [`Config`](../../index/type-aliases/Config.md)\<[`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>\>\>

## Parameters

### schema

`TSchema`

### configs

`TConfigs`

### partial

[`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>

## Returns

`Effect`\<[`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md)\>
