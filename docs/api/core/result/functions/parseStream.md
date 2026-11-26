---
title: "Function: parseStream()"
description: "Exported from @adaptate/core/result."
---

# Function: parseStream()

> **parseStream**\<`T`, `P`\>(`source`, `schema`, `partialSchema?`, `makeFeed?`): `AsyncGenerator`\<[`StreamStep`](../type-aliases/StreamStep.md)\<`T`, `P`\>\>

## Type Parameters

### T

`T`

### P

`P` = `unknown`

## Parameters

### source

`AsyncIterable`\<`string` \| `Uint8Array`\<`ArrayBufferLike`\>\>

### schema

[`StandardSchemaV1`](../../standard/interfaces/StandardSchemaV1.md)\<`unknown`, `T`\>

### partialSchema?

[`StandardSchemaV1`](../../standard/interfaces/StandardSchemaV1.md)\<`unknown`, `P`\>

### makeFeed?

() => [`TrackedFeed`](../../stream-incremental/type-aliases/TrackedFeed.md)

## Returns

`AsyncGenerator`\<[`StreamStep`](../type-aliases/StreamStep.md)\<`T`, `P`\>\>
