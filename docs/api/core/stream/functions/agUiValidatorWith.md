---
title: "Function: agUiValidatorWith()"
description: "Exported from @adaptate/core/stream."
---

# Function: agUiValidatorWith()

> **agUiValidatorWith**\<`TSchema`, `TConfigs`\>(`schema`, `configs`, `makeFeed`): ((`event`) => \{ `id`: `string`; `partial`: [`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>; `results`: `Results`\<`TConfigs`\>; \} \| `undefined`) & `object`

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

### makeFeed

() => [`PartialJsonFeed`](../type-aliases/PartialJsonFeed.md)

## Returns

((`event`) => \{ `id`: `string`; `partial`: [`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>; `results`: `Results`\<`TConfigs`\>; \} \| `undefined`) & `object`
