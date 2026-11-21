---
title: "Class: AdaptateValidationError"
description: "Exported from @adaptate/core/effect."
---

# Class: AdaptateValidationError

## Extends

- `AdaptateValidationError_base`\<\{ `configName`: `string`; `issues`: `ReadonlyArray`\<`z.core.$ZodIssue`\>; \}\>

## Constructors

### Constructor

> **new AdaptateValidationError**(`args`): `AdaptateValidationError`

#### Parameters

##### args

###### configName

`string`

###### issues

readonly `$ZodIssue`[]

#### Returns

`AdaptateValidationError`

#### Inherited from

`AdaptateValidationError_base<{ readonly configName: string; readonly issues: ReadonlyArray<z.core.$ZodIssue>; }>.constructor`

## Properties

### \_tag

> `readonly` **\_tag**: `"AdaptateValidationError"`

#### Inherited from

`AdaptateValidationError_base._tag`

***

### configName

> `readonly` **configName**: `string`

#### Inherited from

`AdaptateValidationError_base.configName`

***

### issues

> `readonly` **issues**: readonly `$ZodIssue`[]

#### Inherited from

`AdaptateValidationError_base.issues`
