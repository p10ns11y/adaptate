---
title: "Function: zodToOpenAPISchema()"
description: "Converts a Zod schema to an OpenAPI / JSON Schema compatible object. Now feature-complete with: - Proper `required` array for objects (excludes .optional() fields) - Support for..."
---

# Function: zodToOpenAPISchema()

> **zodToOpenAPISchema**(`zodSchema`): `any`

Converts a Zod schema to an OpenAPI / JSON Schema compatible object.
Now feature-complete with:
- Proper `required` array for objects (excludes .optional() fields)
- Support for .nullable()
- String validations: minLength, maxLength, pattern, format
- Number validations: minimum, maximum, exclusive*, multipleOf, integer
- Array minItems / maxItems
- Enum support
- Union / anyOf
- Description from .describe()
- Zod 4 attached checks (`_zod.def.checks`) and legacy `_def.checks` where present

## Parameters

### zodSchema

`ZodType`

## Returns

`any`
