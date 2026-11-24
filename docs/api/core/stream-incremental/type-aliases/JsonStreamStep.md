---
title: "Type Alias: JsonStreamStep"
description: "Exported from @adaptate/core/stream-incremental."
---

# Type Alias: JsonStreamStep

> **JsonStreamStep** = `object`

## Properties

### complete

> `readonly` **complete**: `boolean`

***

### openPath?

> `readonly` `optional` **openPath?**: [`JsonPath`](JsonPath.md)

Keys from the root to the deepest open value. A value off `openPath` is final
unless the document repeats a key on that path later (`JSON.parse` lets the last duplicate win).

***

### tailOpen?

> `readonly` `optional` **tailOpen?**: `boolean`

True while the last value on `openPath` is a cut-off string, number or keyword.

***

### value

> `readonly` **value**: `unknown`
