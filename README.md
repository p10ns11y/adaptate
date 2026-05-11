# Adaptate

Dynamic and Adaptable Model Validator Using Zod, Interoperable with OpenAPI

![Coverage Badge](/coverage-badge.svg)

## Overview

`adaptate` is a dynamic and adaptable model validator that leverages Zod for schema validation and is interoperable with OpenAPI. Define a single optional Zod schema for your data model, then use configuration objects to declare which fields each consumer requires — at runtime.

## Packages

| Package | Description |
|---------|-------------|
| [`@adaptate/core`](packages/core/) | Schema transformation engine — make fields required based on config |
| [`@adaptate/utils`](packages/utils/) | OpenAPI ↔ Zod conversion, YAML spec loading with `$ref` resolution |

## Installation

```sh
pnpm add @adaptate/core
# or
npm install @adaptate/core
```

For OpenAPI utilities:

```sh
pnpm add @adaptate/utils
# or
npm install @adaptate/utils
```

Peer dependency: `zod@^3.23.8 || ^4.0.0`

## The Problem

In component-oriented applications, different components consume different subsets of the same data model. One component needs `name` and `age`, another needs `address.city`, and a third needs everything. The data often comes from different API endpoints with varying completeness.

Without runtime validation per consumer, you either:
- Make everything optional (no safety) 
- Make everything required (breaks partial views)
- Maintain separate schemas per component (duplication nightmare)

**Adaptate** solves this: define one schema with all fields optional, then use a config object to declare what each consumer requires.

## Usage

### Make Fields Required by Configuration

```ts
import { z } from 'zod';
import { transformSchema } from '@adaptate/core';

const schema = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
  }).optional(),
});

const config = {
  name: true,
  age: true,
  address: { city: true },
};

const updatedSchema = transformSchema(schema, config);

updatedSchema.parse({ name: 'Davin', age: 30, address: { city: 'Pettit' } }); // passes
updatedSchema.parse({ name: 'Davin', age: 30, address: { street: 'Main St' } }); // throws
```

### Conditional Requirements

<details>
<summary>Make fields required based on runtime data</summary>

```ts
import { z } from 'zod';
import { makeConditionalSchemaTransformer } from '@adaptate/core';

const schema = z.object({
  parentContactNumber: z.number().optional(),
  age: z.number().optional(),
});

const config = {
  parentContactNumber: { requiredIf: (data: any) => data.age < 18 },
  age: true,
};

const data = { age: 17 };
const transformer = makeConditionalSchemaTransformer(data)(schema, config);

transformer.run(); // throws — parentContactNumber required because age < 18
```

</details>

### OpenAPI ↔ Zod Conversion

<details>
<summary>Convert OpenAPI schemas to Zod and back (now fully feature-complete)</summary>

**Load and dereference an OpenAPI spec:**

```ts
import { getDereferencedOpenAPIDocument } from '@adaptate/utils';

const doc = await getDereferencedOpenAPIDocument({
  location: 'filesystem',
  callSiteURL: import.meta.url,
  relativePathToSpecFile: './api-spec.yml',
});
```

**Convert OpenAPI schema to Zod:**

```ts
import { openAPISchemaToZod } from '@adaptate/utils';

const zodSchema = openAPISchemaToZod({
  type: 'object',
  required: ['age'],
  properties: {
    name: { type: 'string', minLength: 2 },
    age: { type: 'integer', minimum: 0 },
  },
});
```

**Convert Zod to OpenAPI schema:**

```ts
import { z } from 'zod';
import { zodToOpenAPISchema } from '@adaptate/utils';

const openAPISchema = zodToOpenAPISchema(
  z.object({ name: z.string().min(2), age: z.number().int() })
);
```

See [`@adaptate/utils` README](packages/utils/README.md) for full documentation.

</details>

## Development

This is a pnpm monorepo orchestrated with Turborepo.

**Requirements:** Node.js ≥ 20, pnpm 9.12.3

```sh
pnpm install          # Install dependencies
pnpm build            # Full pipeline: check-types → test → build
pnpm test             # Run Vitest in watch mode
npx vitest run        # Single test run
npx turbo run check-types  # TypeScript type checking
```

### Project Structure

```
├── packages/
│   ├── core/         # @adaptate/core — schema transformation
│   └── utils/        # @adaptate/utils — OpenAPI utilities
├── skills/           # Tool-agnostic agent SOPs
├── AGENTS.md         # Agent guidelines
├── CODING_STYLE.md   # Coding conventions
└── turbo.json        # Turborepo task graph
```

See [`AGENTS.md`](AGENTS.md) for full development guidelines and [`skills/`](skills/) for operational procedures.

## Credits

<details>
<summary>Background and motivation</summary>

This library recreates and generalizes a pattern from [Oneflow AB](https://oneflow.com), where a component used on two different pages received data from different endpoints. The same model had different required fields depending on context. A runtime validation layer with component-specific configs prevented breakage without duplicating schemas.

The initial implementation was prototyped with **ChatGPT Canvas** — an exercise in testing code generators on recursive Zod schema traversal. The key insight: generators initially used `.required()` (a ZodObject method) instead of `.unwrap()` (strips optionality) — a subtle bug in recursive contexts.

[Full conversation with ChatGPT Canvas](https://chatgpt.com/share/6728eb4e-07f8-8005-b586-c4b8ee0e798c)

</details>

## License

MIT
