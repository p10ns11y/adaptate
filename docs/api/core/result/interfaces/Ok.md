---
title: "Interface: Ok\\<T, E\\>"
description: "Exported from @adaptate/core/result."
---

# Interface: Ok\<T, E\>

## Extends

- [`Track`](Track.md)\<`T`, `E`\>

## Type Parameters

### T

`T`

### E

`E` = `never`

## Properties

### ok

> `readonly` **ok**: `true`

***

### value

> `readonly` **value**: `T`

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

#### Inherited from

[`Track`](Track.md).[`flatMap`](Track.md#flatmap)

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

#### Inherited from

[`Track`](Track.md).[`map`](Track.md#map)

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

#### Inherited from

[`Track`](Track.md).[`mapError`](Track.md#maperror)

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

#### Inherited from

[`Track`](Track.md).[`match`](Track.md#match)

***

### recover()

> **recover**\<`U`\>(`fallback`): `Ok`\<`T` \| `U`, `never`\>

#### Type Parameters

##### U

`U`

#### Parameters

##### fallback

(`error`) => `U`

#### Returns

`Ok`\<`T` \| `U`, `never`\>

#### Inherited from

[`Track`](Track.md).[`recover`](Track.md#recover)
