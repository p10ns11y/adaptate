---
title: "Type Alias: StreamStep\\<T, P\\>"
description: "One `parseStream` step. `openPath` holds the keys from the root to the deepest open value. A value off `openPath` is final unless the document repeats a key on that path later (..."
---

# Type Alias: StreamStep\<T, P\>

> **StreamStep**\<`T`, `P`\> = \{ `done`: `false`; `openPath?`: [`JsonPath`](../../stream-incremental/type-aliases/JsonPath.md); `result`: [`Result`](Result.md)\<`P`\>; `tailOpen?`: `boolean`; \} \| \{ `done`: `true`; `openPath?`: [`JsonPath`](../../stream-incremental/type-aliases/JsonPath.md); `result`: [`Result`](Result.md)\<`T`\>; `tailOpen?`: `boolean`; \}

One `parseStream` step. `openPath` holds the keys from the root to the deepest open
value. A value off `openPath` is final unless the document repeats a key on that path later
(`JSON.parse` lets the last duplicate win). A partial step whose partial schema fails
has no `result.value`, so no path on it is settled.

## Type Parameters

### T

`T`

### P

`P`
