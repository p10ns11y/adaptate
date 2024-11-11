## Installation

To install the library, use npm or yarn:

```sh
npm install @adaptate/utils
# or
yarn add @adaptate/utils
```

### Generate zod schemas from existing OpenAPI spec

Spec parser that takes care of the usage of `$ref`.

```ts
import { getDereferencedOpenAPIDocument } from '@adaptate/utils';

// from local disk
let dereferencedOpenAPIDocument = await getDereferencedOpenAPIDocument({
  environment: 'server',
  callSiteURL: import.meta.url,
  relativePathToSpecFile: '../fixtures/base-schema.yml',
});

// or from web

let dereferencedOpenAPIDocument = await getDereferencedOpenAPIDocument({
  environment: 'browser',
  webURL: 'https://api.apis.guru/v2/specs/googleapis.com/books/v1/openapi.yaml',
});

for (let [name, schema] of Object.entries(
  dereferencedOpenAPIDocument.components.schemas
)) {
  // Generate zod schema
  let zodSchema = openAPISchemaToZod(schema);
  // write zodSchema to .ts or .d.ts modules
}
```

use [json-schema-to-zod](https://github.com/StefanTerdell/json-schema-to-zod) and `$ref` is already expanded by `getDereferencedOpenAPIDocument` and you can skip [this part](https://github.com/StefanTerdell/json-schema-to-zod?tab=readme-ov-file#example-with-refs-resolved-and-output-formatted-1)

```ts
for (let [name, schema] of Object.entries(
  dereferencedOpenAPIDocument.components.schemas
)) {
  // Generate zod schema module for each schema
  jsonSchemaToZod(schema, {
    name,
    module: 'esm',
    type: true,
  });
}
```

### Converting OpenAPI Schema to Zod Schema (most commonly needed)

The utility is in the early stage and not one to one. For complete and advanced use cases check [json-schema-to-zod](https://snyk.io/advisor/npm-package/json-schema-to-zod)

```ts
import { incomplete_openAPISchemaToZod } from '@adaptate/utils';

const openAPISchema = {
  type: 'object',
  required: ['age'],
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
};

const zodSchema = incomplete_openAPISchemaToZod(openAPISchema);
```

### Converting Zod Schema to OpenAPI Schema

The utility is in the early stage and not one to one. For complete and advanced use cases check [zod-to-json-schema](https://snyk.io/advisor/npm-package/zod-to-json-schema)

```ts
import { z } from 'zod';
import { incomplete_zodToOpenAPISchema } from '@adaptate/utils';

const zodSchema = z.object({
  name: z.string(),
  age: z.number(),
});

const openAPISchema = incomplete_zodToOpenAPISchema(zodSchema);
```
