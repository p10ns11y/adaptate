---
title: "Function: verifyBuffer()"
description: "Exported from @adaptate/core/verify."
---

# Function: verifyBuffer()

> **verifyBuffer**(`bytes`, `manifestOrVerifiers`, `context?`): `Promise`\<[`VerifyResult`](../type-aliases/VerifyResult.md)\<`Uint8Array`\<`ArrayBufferLike`\>\>\>

## Parameters

### bytes

`Uint8Array`

### manifestOrVerifiers

[`VerifyManifest`](../interfaces/VerifyManifest.md) \| readonly [`Verifier`](../interfaces/Verifier.md)[]

### context?

`Omit`\<[`VerifyContext`](../interfaces/VerifyContext.md), `"bytes"`\>

## Returns

`Promise`\<[`VerifyResult`](../type-aliases/VerifyResult.md)\<`Uint8Array`\<`ArrayBufferLike`\>\>\>
