---
title: "Type Alias: DeepPartial\\<T\\>"
description: "Exported from @adaptate/core."
---

# Type Alias: DeepPartial\<T\>

> **DeepPartial**\<`T`\> = `T` *extends* readonly infer U[] ? `DeepPartial`\<`U`\>[] : `T` *extends* `object` ? `{ [K in keyof T]?: DeepPartial<T[K]> }` : `T`

## Type Parameters

### T

`T`
