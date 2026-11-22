---
title: "Function: openAPISchemaToZod()"
description: "Converts an OpenAPI / JSON Schema object to a Zod schema. Supports a wide range of features for feature-completeness: - Primitives: string, number, integer, boolean - Complex: o..."
---

# Function: openAPISchemaToZod()

> **openAPISchemaToZod**(`schema`, `propertyKey?`, `required?`): `ZodType`

Converts an OpenAPI / JSON Schema object to a Zod schema.
Supports a wide range of features for feature-completeness:
- Primitives: string, number, integer, boolean
- Complex: object, array, enum
- Validations: min/max length, min/max, pattern, format (email, uuid, url, datetime, etc.)
- Combinators: allOf (intersection), anyOf/oneOf (union)
- Nullable
- Proper required field handling

Note: $ref should be pre-resolved by getDereferencedOpenAPIDocument.

## Parameters

### schema

`any`

### propertyKey?

`string`

### required?

`string`[]

## Returns

`ZodType`
