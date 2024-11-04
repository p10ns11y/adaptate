# Adaptate

Dynamic and Adaptable Model Validator Using Zod, Interoperable with OpenAPI

## Overview

`adaptate` is a dynamic and adaptable model validator that leverages the power of Zod for schema validation and is interoperable with OpenAPI. This library allows you to define, validate, and transform schemas seamlessly.

## Features

- Convert JSON Schema to Zod schemas
- Convert Zod schemas to OpenAPI schemas
- Apply conditional requirements to schemas
- Make schemas required based on configuration

## Installation

To install the library, use npm or yarn:

```sh
npm install adaptate
# or
yarn add adaptate
```

## Usage

### Convert OpenAPI Schema to Zod Schema

You can convert a JSON Schema to a Zod schema using the `openAPISchemaToZod` function.

```ts
import { openAPISchemaToZod } from 'adaptate';

const openAPISchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
};

const zodSchema = openAPISchemaToZod(openAPISchema);
```

### Convert Zod Schema to OpenAPI Schema

You can convert a Zod schema to an OpenAPI schema using the zodToOpenAPISchema function.

```ts
import { z } from 'zod';
import { zodToOpenAPISchema } from 'adaptate';

const zodSchema = z.object({
  name: z.string(),
  age: z.number(),
});

const openAPISchema = zodToOpenAPISchema(zodSchema);
```

### Apply Conditional Requirements

You can apply conditional requirements to a Zod schema using the applyConditionalRequirements function.

```ts
import { z } from 'zod';
import { applyConditionalRequirements } from 'adaptate';

const schema = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
});

const config = {
  name: {
    requiredIf: (data) => data.age > 18,
  },
};

const data = { age: 20 };

const updatedSchema = applyConditionalRequirements(schema, config, data);
```

### Make Schema Required Based on Configuration

You can make a Zod schema required based on a configuration using the makeSchemaRequired function.

```ts
import { z } from 'zod';
import { makeSchemaRequired } from 'adaptate';

const schema = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
});

const config = {
  name: true,
  age: true,
};

const updatedSchema = makeSchemaRequired(schema, config);
```

### Loading schema directly form OpenAPI spec file

It is not exported something similar for your use case, you could build your
Own yml loader, spec parser that take care of usage of `$ref`.

```ts
// loadAndResolveYAML.ts
import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import SwaggerParser from '@apidevtools/swagger-parser';
import yaml from 'js-yaml';

export async function loadAndResolveYAML(
  fileURL: string,
  relativePath: string
) {
  try {
    let fileURLPath = fileURLToPath(fileURL);
    let callerDirectoryName = dirname(fileURLPath);
    let yamlFilePath = path.resolve(callerDirectoryName, relativePath);
    const openapiDocument = yaml.load(
      fs.readFileSync(yamlFilePath, 'utf8')
    ) as string;

    const dereferenced = await SwaggerParser.dereference(openapiDocument);

    // For debugging uncomment this!
    // console.log(JSON.stringify(dereferenced, null, 2));

    return dereferenced;
  } catch (error) {
    console.error('Error:', error);
  }
}
```

Example usage

```ts
let dataLoadedFromYAML = await loadAndResolveYAML(
  import.meta.url,
  '../fixtures/base-schema.yml' // relative path to spec yml file from where it is called
);
let dataZodSchema = openAPISchemaToZod(
  dataLoadedFromYAML['components']['schemas']['Category']
);
```

## Credits

- [Conversation with ChatGPT Canvas](https://chatgpt.com/share/6728eb4e-07f8-8005-b586-c4b8ee0e798c)

### So why?

#### The Background

At [Oneflow AB](https://oneflow.com), we faced a situation where a component was used on two different pages, each receiving data from different endpoints. This led to discrepancies in the properties of the same model for valid reasons. To avoid breaking the app, I have built a run-time validation library that abstracted business data extensively . Although it wasn't completely dynamic, it supported specifying business entities, types such as `collection` or `entity`, and reusable specifications like `relations`. It also included React-specific hooks that worked seamlessly with error boundaries. This effort aims to create a more generic solution that can be extended to various use cases.
