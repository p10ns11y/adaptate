---
title: "Function: isSettled()"
description: "True when `path` holds a value that later steps will not change."
---

# Function: isSettled()

> **isSettled**(`step`, `path`): `boolean`

True when `path` holds a value that later steps will not change.

## Parameters

### step

[`JsonStreamStep`](../type-aliases/JsonStreamStep.md) \| \{ `done`: `boolean`; `openPath?`: [`JsonPath`](../type-aliases/JsonPath.md); `result`: \{ `ok`: `boolean`; `value?`: `unknown`; \}; \}

### path

[`JsonPath`](../type-aliases/JsonPath.md)

## Returns

`boolean`
