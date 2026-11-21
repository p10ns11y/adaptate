---
title: "Function: validateAgainstStandardSchemas()"
description: "Exported from @adaptate/core/standard."
---

# Function: validateAgainstStandardSchemas()

> **validateAgainstStandardSchemas**\<`TSchemas`\>(`value`, `schemas`): `Promise`\<\{ \[K in string \| number \| symbol\]: StandardValidationResult\<NonNullable\<TSchemas\[K\]\["~standard"\]\["types"\]\>\["output"\]\> \}\>

## Type Parameters

### TSchemas

`TSchemas` *extends* `Record`\<`string`, [`StandardSchemaV1`](../interfaces/StandardSchemaV1.md)\<`unknown`, `unknown`\>\>

## Parameters

### value

`unknown`

### schemas

`TSchemas`

## Returns

`Promise`\<\{ \[K in string \| number \| symbol\]: StandardValidationResult\<NonNullable\<TSchemas\[K\]\["~standard"\]\["types"\]\>\["output"\]\> \}\>
