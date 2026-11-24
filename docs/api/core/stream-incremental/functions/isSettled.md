---
title: "Function: isSettled()"
description: "True when `path` holds a value that later steps will not change, unless the document repeats a key on that path."
---

# Function: isSettled()

> **isSettled**(`step`, `path`): `boolean`

True when `path` holds a value that later steps will not change, unless the document repeats a key on that path.

Array steps take integer index keys and object steps take string keys, as in `openPath`.
A value off `openPath` is final unless the document repeats a key on that path later
(`JSON.parse` lets the last duplicate win). A partial step whose partial schema
fails has no `result.value`, so no path on it is settled.

## Parameters

### step

[`JsonStreamStep`](../type-aliases/JsonStreamStep.md) \| \{ `done`: `boolean`; `openPath?`: [`JsonPath`](../type-aliases/JsonPath.md); `result`: \{ `ok`: `boolean`; `value?`: `unknown`; \}; \}

### path

[`JsonPath`](../type-aliases/JsonPath.md)

## Returns

`boolean`
