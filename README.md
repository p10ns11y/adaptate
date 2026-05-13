# Adaptate

Dynamic and Adaptable Model Validator Using Zod, Interoperable with OpenAPI

<!-- Packages on npm -->
[![npm: adaptate](https://img.shields.io/npm/v/adaptate?label=adaptate&logo=npm&color=cb3837)](https://www.npmjs.com/package/adaptate)
[![npm: @adaptate/core](https://img.shields.io/npm/v/@adaptate/core?label=%40adaptate%2Fcore&logo=npm&color=cb3837)](https://www.npmjs.com/package/@adaptate/core)
[![npm: @adaptate/utils](https://img.shields.io/npm/v/@adaptate/utils?label=%40adaptate%2Futils&logo=npm&color=cb3837)](https://www.npmjs.com/package/@adaptate/utils)
[![downloads / month](https://img.shields.io/npm/dm/@adaptate/core?logo=npm&label=downloads%2Fmonth)](https://www.npmjs.com/package/@adaptate/core)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@adaptate/core?label=minzipped)](https://bundlephobia.com/package/@adaptate/core)
[![types: included](https://img.shields.io/npm/types/@adaptate/core)](https://www.npmjs.com/package/@adaptate/core)

<!-- Build, quality, supply chain -->
[![CI](https://img.shields.io/github/actions/workflow/status/p10ns11y/adaptate/ci.yml?branch=main&logo=github&label=CI)](https://github.com/p10ns11y/adaptate/actions/workflows/ci.yml)
[![Coverage](./coverage-badge.svg)](./coverage)
[![Socket.dev supply chain](https://img.shields.io/badge/socket.dev-supply%20chain-1f6feb)](https://socket.dev/npm/package/adaptate/overview)
[![License: MIT](https://img.shields.io/npm/l/@adaptate/core?color=blue)](./LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/p10ns11y/adaptate?logo=github)](https://github.com/p10ns11y/adaptate/commits/main)
[![Issues](https://img.shields.io/github/issues/p10ns11y/adaptate?logo=github)](https://github.com/p10ns11y/adaptate/issues)
[![Stars](https://img.shields.io/github/stars/p10ns11y/adaptate?style=flat&logo=github)](https://github.com/p10ns11y/adaptate/stargazers)

<!-- Language & toolchain -->
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./tsconfig.json)
[![Node >=24](https://img.shields.io/node/v/@adaptate/core?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm 11.1.1](https://img.shields.io/badge/pnpm-11.1.1-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![Zod peer](https://img.shields.io/badge/zod-%5E3.25%20%7C%7C%20%5E4.0-3b82f6?logo=zod&logoColor=white)](https://zod.dev)
[![Dev Container](https://img.shields.io/badge/dev%20container-ready-2496ED?logo=docker&logoColor=white)](./.devcontainer/README.md)

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

There are two common ways to create a fully optional schema:

**1. Using `.deepPartial()` (recommended)**

```ts
import { z } from 'zod';
import { transformSchema, type Config } from '@adaptate/core';

const schema = z.object({
  name: z.string(),
  age: z.number(),
  address: z.object({
    street: z.string(),
    city: z.string(),
  }),
}).deepPartial();

const config = {
  name: true,
  age: true,
  address: { city: true },
} satisfies Config<z.infer<typeof schema>>;

const updatedSchema = transformSchema(schema, config);

updatedSchema.parse({ name: 'Davin', age: 30, address: { city: 'Pettit' } }); // passes
updatedSchema.parse({ name: 'Davin', age: 30, address: { street: 'Main St' } }); // throws
```

**2. Manual `.optional()` (still works)**

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

// ... same config and usage as above
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

## Design Philosophy

**Compact & Powerful**: The core transformation logic is intentionally compact — fewer than 100 lines of code. Complex nested transformations (deep objects, arrays with wildcards, conditional requirements) are handled elegantly through recursion. This keeps the API surface small while delivering sophisticated behavior with minimal cognitive overhead.

**For a deeper dive**, see [`DESIGN.md`](DESIGN.md) which covers:
- Detailed code walkthroughs
- Runtime complexity analysis (O(N) time, O(D) space)
- Performance characteristics and trade-offs
- Comparison with alternative approaches

## Development

This is a pnpm monorepo orchestrated with Turborepo.

**Package manager:** Use **[pnpm](https://pnpm.io/) only** when working in this repository (`pnpm install`). This repo’s **install/build safety posture** is defined for pnpm (`.npmrc`, `pnpm-workspace.yaml`: lifecycle restrictions, store integrity, release-age gates, etc.). **`npm install`** at the root is unsupported — npm ignores or mishandles several of those controls and may resolve dependencies differently than CI, **weakening protections against supply-chain attacks** that the config is meant to mitigate. Root `package.json` pins [`packageManager`](https://nodejs.org/api/packages.html#packagemanager). The **Installation** section above (`pnpm add` / `npm install` for `@adaptate/*`) applies to **consumers** installing published packages from the npm registry.

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
├── .devcontainer/     # optional Dev Container (Node 24 + pnpm)
├── packages/
│   ├── core/         # @adaptate/core — schema transformation
│   └── utils/        # @adaptate/utils — OpenAPI utilities
├── skills/           # Tool-agnostic agent SOPs
├── AGENTS.md         # Agent guidelines
├── CODING_STYLE.md   # Coding conventions
└── turbo.json        # Turborepo task graph
```

See [`AGENTS.md`](AGENTS.md) and [`skills/`](skills/) for development guidelines and operational procedures. Optional **dev container**: [`.devcontainer/README.md`](.devcontainer/README.md), [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json).

## Credits

This library recreates and generalizes a pattern originally observed at [Oneflow AB](https://oneflow.com), where the same data model was consumed by different components with varying required fields depending on context.

**Development note**: Initial prototype was created with ChatGPT Canvas. All important caveats and refinements were manually corrected by the author. The PR (#21) marks the first use of AI coding agents (Grok) in the project. Cursor Cloud Agent prepared the repo for agentic development workflows.

## License

MIT
