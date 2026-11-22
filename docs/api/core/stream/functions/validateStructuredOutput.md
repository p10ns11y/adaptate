---
title: "Function: validateStructuredOutput()"
description: "Exported from @adaptate/core/stream."
---

# Function: validateStructuredOutput()

> **validateStructuredOutput**\<`TSchema`, `TConfigs`\>(`output`, `schema`, `configs`): `object`

## Type Parameters

### TSchema

`TSchema` *extends* `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>

### TConfigs

`TConfigs` *extends* `Record`\<`string`, [`Config`](../../index/type-aliases/Config.md)\<[`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>\>\>

## Parameters

### output

#### final?

`output`\<`TSchema`\> \| `null`

#### partial?

[`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\> \| `null`

### schema

`TSchema`

### configs

`TConfigs`

## Returns

`object`

### final

> **final**: `Results`\<`TConfigs`\> \| `null`

### partial

> **partial**: `Results`\<`TConfigs`\> \| `null`
