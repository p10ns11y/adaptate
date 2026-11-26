---
title: "Interface: VerifyManifest"
description: "Exported from @adaptate/core/verify."
---

# Interface: VerifyManifest

## Properties

### custom?

> `readonly` `optional` **custom?**: readonly [`Verifier`](Verifier.md)[]

***

### formal?

> `readonly` `optional` **formal?**: [`Verifier`](Verifier.md) \| ((`context`) => [`VerifyResult`](../type-aliases/VerifyResult.md)\<`Uint8Array`\<`ArrayBufferLike`\>\> \| `Promise`\<[`VerifyResult`](../type-aliases/VerifyResult.md)\<`Uint8Array`\<`ArrayBufferLike`\>\>\>)

***

### hash?

> `readonly` `optional` **hash?**: `object`

#### algorithm?

> `readonly` `optional` **algorithm?**: [`HashAlgorithm`](../type-aliases/HashAlgorithm.md)

#### value

> `readonly` **value**: `string`

***

### mime?

> `readonly` `optional` **mime?**: `string`

***

### name?

> `readonly` `optional` **name?**: `string`

***

### size?

> `readonly` `optional` **size?**: `number`
