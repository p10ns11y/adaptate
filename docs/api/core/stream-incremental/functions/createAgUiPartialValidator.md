---
title: "Function: createAgUiPartialValidator()"
description: "Exported from @adaptate/core/stream-incremental."
---

# Function: createAgUiPartialValidator()

> **createAgUiPartialValidator**\<`TSchema`, `TConfigs`\>(`schema`, `configs`): ((`event`) => \{ `id`: `string`; `partial`: [`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>; `results`: \{ \[K in string \| number \| symbol\]: PartialValidationResult \}; \} \| `undefined`) & `object`

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

## Returns

((`event`) => \{ `id`: `string`; `partial`: [`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>; `results`: \{ \[K in string \| number \| symbol\]: PartialValidationResult \}; \} \| `undefined`) & `object`
