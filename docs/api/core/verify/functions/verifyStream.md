---
title: "Function: verifyStream()"
description: "Exported from @adaptate/core/verify."
---

# Function: verifyStream()

> **verifyStream**(`source`, `manifestOrVerifiers`, `context?`): `Promise`\<[`VerifyResult`](../type-aliases/VerifyResult.md)\<`Uint8Array`\<`ArrayBufferLike`\>\>\>

## Parameters

### source

`AsyncIterable`\<`Uint8Array`\<`ArrayBufferLike`\>\>

### manifestOrVerifiers

[`VerifyManifest`](../interfaces/VerifyManifest.md) \| readonly [`Verifier`](../interfaces/Verifier.md)[]

### context?

`Omit`\<[`VerifyContext`](../interfaces/VerifyContext.md), `"bytes"`\>

## Returns

`Promise`\<[`VerifyResult`](../type-aliases/VerifyResult.md)\<`Uint8Array`\<`ArrayBufferLike`\>\>\>
