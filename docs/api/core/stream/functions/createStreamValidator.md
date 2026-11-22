---
title: "Function: createStreamValidator()"
description: "Exported from @adaptate/core/stream."
---

# Function: createStreamValidator()

> **createStreamValidator**\<`TSchema`, `TConfigs`\>(`schema`, `configs`): `object`

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

`object`

### final()

> **final**(`value`): `Results`\<`TConfigs`\>

#### Parameters

##### value

`unknown`

#### Returns

`Results`\<`TConfigs`\>

### partial()

> **partial**(`value`): `Results`\<`TConfigs`\>

#### Parameters

##### value

[`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>

#### Returns

`Results`\<`TConfigs`\>
