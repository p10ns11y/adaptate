---
title: "Type Alias: StreamStep\\<T, P\\>"
description: "Exported from @adaptate/core/result."
---

# Type Alias: StreamStep\<T, P\>

> **StreamStep**\<`T`, `P`\> = \{ `done`: `false`; `openPath?`: [`JsonPath`](../../stream-incremental/type-aliases/JsonPath.md); `result`: [`Result`](Result.md)\<`P`\>; `tailOpen?`: `boolean`; \} \| \{ `done`: `true`; `openPath?`: [`JsonPath`](../../stream-incremental/type-aliases/JsonPath.md); `result`: [`Result`](Result.md)\<`T`\>; `tailOpen?`: `boolean`; \}

## Type Parameters

### T

`T`

### P

`P`
