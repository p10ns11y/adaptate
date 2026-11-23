---
title: "Interface: Track\\<T, E\\>"
description: "Exported from @adaptate/core/result."
---

# Interface: Track\<T, E\>

## Extended by

- [`Ok`](Ok.md)
- [`Err`](Err.md)

## Type Parameters

### T

`T`

### E

`E`

## Methods

### flatMap()

> **flatMap**\<`U`, `F`\>(`next`): [`Result`](../type-aliases/Result.md)\<`U`, `E` \| `F`\>

#### Type Parameters

##### U

`U`

##### F

`F`

#### Parameters

##### next

(`value`) => [`Result`](../type-aliases/Result.md)\<`U`, `F`\>

#### Returns

[`Result`](../type-aliases/Result.md)\<`U`, `E` \| `F`\>

***

### map()

> **map**\<`U`\>(`transform`): [`Result`](../type-aliases/Result.md)\<`U`, `E`\>

#### Type Parameters

##### U

`U`

#### Parameters

##### transform

(`value`) => `U`

#### Returns

[`Result`](../type-aliases/Result.md)\<`U`, `E`\>

***

### mapError()

> **mapError**\<`F`\>(`transform`): [`Result`](../type-aliases/Result.md)\<`T`, `F`\>

#### Type Parameters

##### F

`F`

#### Parameters

##### transform

(`error`) => `F`

#### Returns

[`Result`](../type-aliases/Result.md)\<`T`, `F`\>

***

### match()

> **match**\<`U`\>(`onOk`, `onErr`): `U`

#### Type Parameters

##### U

`U`

#### Parameters

##### onOk

(`value`) => `U`

##### onErr

(`error`) => `U`

#### Returns

`U`

***

### recover()

> **recover**\<`U`\>(`fallback`): [`Ok`](Ok.md)\<`T` \| `U`, `never`\>

#### Type Parameters

##### U

`U`

#### Parameters

##### fallback

(`error`) => `U`

#### Returns

[`Ok`](Ok.md)\<`T` \| `U`, `never`\>
