---
title: "Interface: StandardSchemaV1\\<Input, Output\\>"
description: "Exported from @adaptate/core/standard."
---

# Interface: StandardSchemaV1\<Input, Output\>

## Type Parameters

### Input

`Input` = `unknown`

### Output

`Output` = `Input`

## Properties

### ~standard

> `readonly` **~standard**: `object`

#### types?

> `readonly` `optional` **types?**: `object`

##### types.input

> `readonly` **input**: `Input`

##### types.output

> `readonly` **output**: `Output`

#### validate

> `readonly` **validate**: (`value`) => [`StandardResult`](../type-aliases/StandardResult.md)\<`Output`\> \| `Promise`\<[`StandardResult`](../type-aliases/StandardResult.md)\<`Output`\>\>

##### Parameters

###### value

`unknown`

##### Returns

[`StandardResult`](../type-aliases/StandardResult.md)\<`Output`\> \| `Promise`\<[`StandardResult`](../type-aliases/StandardResult.md)\<`Output`\>\>

#### vendor

> `readonly` **vendor**: `string`

#### version

> `readonly` **version**: `1`
