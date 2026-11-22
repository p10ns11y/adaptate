---
title: "Function: validatePartialAgainstConfigs()"
description: "Exported from @adaptate/core."
---

# Function: validatePartialAgainstConfigs()

> **validatePartialAgainstConfigs**\<`TSchema`, `TConfigs`\>(`schema`, `partial`, `configs`): \{ \[K in string \| number \| symbol\]: PartialValidationResult \}

## Type Parameters

### TSchema

`TSchema` *extends* `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>

### TConfigs

`TConfigs` *extends* `Record`\<`string`, [`Config`](../type-aliases/Config.md)\<[`DeepPartial`](../type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>\>\>

## Parameters

### schema

`TSchema`

### partial

[`DeepPartial`](../type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>

### configs

`TConfigs`

## Returns

\{ \[K in string \| number \| symbol\]: PartialValidationResult \}
