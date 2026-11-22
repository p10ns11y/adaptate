---
title: "Function: createEffectStreamValidator()"
description: "Exported from @adaptate/core/effect."
---

# Function: createEffectStreamValidator()

> **createEffectStreamValidator**\<`TSchema`, `TConfigs`\>(`schema`, `configs`, `makeFeed?`): `object`

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

### makeFeed?

() => [`PartialJsonFeed`](../../stream/type-aliases/PartialJsonFeed.md)

## Returns

`object`

### final

> **final**: \{(`text`): `Effect`\<[`FinalReport`](../type-aliases/FinalReport.md)\<`output`\<`TSchema`\>, `TConfigs`\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md) \| [`AdaptateParseError`](../classes/AdaptateParseError.md)\>; (`text`, `configName`): `Effect`\<`output`\<`TSchema`\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md) \| [`AdaptateParseError`](../classes/AdaptateParseError.md)\>; \}

#### Call Signature

> (`text`): `Effect`\<[`FinalReport`](../type-aliases/FinalReport.md)\<`output`\<`TSchema`\>, `TConfigs`\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md) \| [`AdaptateParseError`](../classes/AdaptateParseError.md)\>

##### Parameters

###### text

`string`

##### Returns

`Effect`\<[`FinalReport`](../type-aliases/FinalReport.md)\<`output`\<`TSchema`\>, `TConfigs`\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md) \| [`AdaptateParseError`](../classes/AdaptateParseError.md)\>

#### Call Signature

> (`text`, `configName`): `Effect`\<`output`\<`TSchema`\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md) \| [`AdaptateParseError`](../classes/AdaptateParseError.md)\>

##### Parameters

###### text

`string`

###### configName

keyof `TConfigs`

##### Returns

`Effect`\<`output`\<`TSchema`\>, [`AdaptateValidationError`](../classes/AdaptateValidationError.md) \| [`AdaptateParseError`](../classes/AdaptateParseError.md)\>

### agUi()

> **agUi**(`event`): `Effect`\<\{ `id`: `string`; `partial`: [`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>; `results`: \{ \[K in string \| number \| symbol\]: PartialValidationResult \}; \} \| `undefined`, `never`, `never`\>

#### Parameters

##### event

[`AgUiDeltaEvent`](../../stream/type-aliases/AgUiDeltaEvent.md)

#### Returns

`Effect`\<\{ `id`: `string`; `partial`: [`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>; `results`: \{ \[K in string \| number \| symbol\]: PartialValidationResult \}; \} \| `undefined`, `never`, `never`\>

### agUiStream()

> **agUiStream**\<`E`, `R`\>(`events`): `Stream`\<\{ `id`: `string`; `partial`: [`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>; `results`: \{ \[K in string \| number \| symbol\]: PartialValidationResult \}; \} \| `undefined`, `E`, `R`\>

#### Type Parameters

##### E

`E`

##### R

`R`

#### Parameters

##### events

`Stream`\<[`AgUiDeltaEvent`](../../stream/type-aliases/AgUiDeltaEvent.md), `E`, `R`\>

#### Returns

`Stream`\<\{ `id`: `string`; `partial`: [`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>; `results`: \{ \[K in string \| number \| symbol\]: PartialValidationResult \}; \} \| `undefined`, `E`, `R`\>

### partial()

> **partial**(`value`): `Effect`\<\{ \[K in string \| number \| symbol\]: PartialValidationResult \}, `never`\>

#### Parameters

##### value

[`DeepPartial`](../../index/type-aliases/DeepPartial.md)\<`output`\<`TSchema`\>\>

#### Returns

`Effect`\<\{ \[K in string \| number \| symbol\]: PartialValidationResult \}, `never`\>
