---
title: "Type Alias: TrackedStep"
description: "A `fromAsyncIterableSteps` step: a `JsonStreamStep` that always carries `openPath` and `tailOpen`."
---

# Type Alias: TrackedStep

> **TrackedStep** = `object`

A `fromAsyncIterableSteps` step: a `JsonStreamStep` that always carries `openPath` and `tailOpen`.

## Properties

### complete

> `readonly` **complete**: `boolean`

***

### openPath

> `readonly` **openPath**: [`JsonPath`](JsonPath.md)

Keys from the root to the deepest open value. A value off `openPath` is final
unless the document repeats a key on that path later (`JSON.parse` lets the last duplicate win).

***

### tailOpen

> `readonly` **tailOpen**: `boolean`

True while the last value on `openPath` is a cut-off string, number or keyword.

***

### value

> `readonly` **value**: `unknown`
