# @adaptate/utils

OpenAPI ↔ Zod conversion utilities and YAML spec loading with full `$ref` resolution.

## Installation

pnpm add @adaptate/utils
# or
npm install @adaptate/utils

Peer dependency: `zod@^3.23.8 || ^4.0.0`

## API

### `getDereferencedOpenAPIDocument(options)`

Loads an OpenAPI spec (YAML or JSON) and resolves all `$ref` pointers, returning a fully dereferenced document.

```ts
import { getDereferencedOpenAPIDocument } from '@adaptate/utils';

// From filesystem
const doc = await getDereferencedOpenAPIDocument({
  location: 'filesystem',
  callSiteURL: import.meta.url,
  relativePathToSpecFile: '../fixtures/base-schema.yml',
});

// From web URL
const doc = await getDereferencedOpenAPIDocument({
  location: 'web',
  webURL: 'https://api.apis.guru/v2/specs/googleapis.com/books/v1/openapi.yaml',
});
```

Once dereferenced, iterate over schemas to generate Zod types:

```ts
for (const [name, schema] of Object.entries(doc.components.schemas)) {
  const zodSchema = openAPISchemaToZod(schema);
}
```

### `openAPISchemaToZod(schema)`

Converts a JSON Schema / OpenAPI schema object to a Zod schema.

**Feature-complete** — supports:

- All primitive types (`string`, `number`, `integer`, `boolean`)
- `object`, `array`, `enum`
- String constraints: `minLength`, `maxLength`, `pattern`, `format` (email, uuid, url, date-time, date, etc.)
- Number constraints: `minimum`/`maximum`, `exclusiveMinimum`/`exclusiveMaximum`, `multipleOf`
- Array constraints: `minItems`, `maxItems`
- Combinators: `allOf` (`.and()`), `anyOf`/`oneOf` (`.union()`)
- `nullable`
- Proper `required` handling in objects
- Pre-resolved `$ref` (use with `getDereferencedOpenAPIDocument`)

```ts
import { openAPISchemaToZod } from '@adaptate/utils';

const zodSchema = openAPISchemaToZod({
  type: 'object',
  required: ['age'],
  properties: {
    name: { type: 'string', minLength: 2 },
    age: { type: 'integer', minimum: 0 },
    email: { type: 'string', format: 'email' },
    tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
});

zodSchema.parse({ name: 'Ada', age: 25, email: 'ada@example.com', tags: ['dev'] }); // passes
```

### `zodToOpenAPISchema(zodSchema)`

Converts a Zod schema to an OpenAPI-compatible JSON Schema object.

**Feature-complete** — supports:

- Proper `required` array (excludes `.optional()` fields)
- `.nullable()`
- String: min/max length, regex pattern, formats (email, uuid, etc.)
- Number: min/max (inclusive/exclusive), multipleOf, integer
- Array: minItems / maxItems
- Enums (`z.enum` — string enums and numeric member tuples; Zod v4 merged `z.nativeEnum` into `z.enum`)
- Unions (`z.union` → `anyOf`)
- Descriptions via `.describe()`
- Common special types (`ZodDate`, `ZodBigInt`)

```ts
import { z } from 'zod';
import { zodToOpenAPISchema } from '@adaptate/utils';

const openAPISchema = zodToOpenAPISchema(
  z.object({
    name: z.string().min(2).describe('Full name'),
    age: z.number().int().min(0),
    email: z.string().email().optional(),
    tags: z.array(z.string()).min(1),
  })
);

// Result includes:
// {
//   type: 'object',
//   properties: { ... },
//   required: ['name', 'age', 'tags'],
//   ...
// }
```

> These converters are now production-ready for common use cases in the adaptate ecosystem while remaining lightweight. For extremely advanced edge cases, consider `json-schema-to-zod` or `zod-to-json-schema` as drop-in alternatives.

## Exports

| Import path | Environment | Entry |
| --- | --- | --- |
| @adaptate/utils | Browser | build/index.es.js |
| @adaptate/utils/openapi | Node/SSR | ssr-build/openapi.js |
| @adaptate/utils/ssr | Node/SSR | ssr-build/index.js |

The browser build externalizes Node builtins. Use the `/ssr` or `/openapi` export for server-side usage that requires filesystem access (e.g., loading YAML specs from disk).
