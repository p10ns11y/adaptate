# @adaptate/utils

OpenAPI ↔ Zod conversion utilities and YAML spec loading with full `$ref` resolution.

## Installation

```sh
pnpm add @adaptate/utils
# or
npm install @adaptate/utils
```

Peer dependency: `zod@^3.23.8`

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
  const zodSchema = incomplete_openAPISchemaToZod(schema);
}
```

### `incomplete_openAPISchemaToZod(schema)`

Converts a JSON Schema / OpenAPI schema object to a Zod schema.

Supports: `string`, `number`, `integer`, `boolean`, `object`, `array`, `enum`, `allOf`, `oneOf`, `anyOf`, `$ref` (pre-resolved).

```ts
import { incomplete_openAPISchemaToZod } from '@adaptate/utils';

const zodSchema = incomplete_openAPISchemaToZod({
  type: 'object',
  required: ['age'],
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
});

zodSchema.parse({ name: 'Ada', age: 25 }); // passes
```

> **Note:** This is a basic converter. For production-grade conversion, consider [json-schema-to-zod](https://github.com/StefanTerdell/json-schema-to-zod) — `getDereferencedOpenAPIDocument` handles `$ref` resolution so you can skip that step.

### `incomplete_zodToOpenAPISchema(zodSchema)`

Converts a Zod schema to an OpenAPI-compatible JSON Schema object.

```ts
import { z } from 'zod';
import { incomplete_zodToOpenAPISchema } from '@adaptate/utils';

const openAPISchema = incomplete_zodToOpenAPISchema(
  z.object({ name: z.string(), age: z.number() })
);
// { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' } }, required: ['name', 'age'] }
```

> **Note:** This is a basic converter. For advanced use cases, see [zod-to-json-schema](https://github.com/StefanTerdell/json-schema-to-zod).

## Exports

| Import path | Environment | Entry |
|-------------|-------------|-------|
| `@adaptate/utils` | Browser | `build/index.es.js` |
| `@adaptate/utils/openapi` | Node/SSR | `ssr-build/openapi.js` |
| `@adaptate/utils/ssr` | Node/SSR | `ssr-build/index.js` |

The browser build externalizes Node builtins. Use the `/ssr` or `/openapi` export for server-side usage that requires filesystem access (e.g., loading YAML specs from disk).
