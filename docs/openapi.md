---
title: "OpenAPI"
description: "Turn an OpenAPI schema into Zod, and write a Zod schema back out."
---

# OpenAPI

`@adaptate/utils` converts OpenAPI schemas and Zod schemas, and loads a spec. Peer: `zod@^3.25.0 || ^4.0.0`. See [Optional peers](optional-peers.md) for YAML and remote `$ref`s.

```ts
import { getDereferencedOpenAPIDocument, openAPISchemaToZod, zodToOpenAPISchema } from "@adaptate/utils";
import { z } from "zod";

const doc = await getDereferencedOpenAPIDocument({
  location: "filesystem",
  callSiteURL: import.meta.url,
  relativePathToSpecFile: "./api-spec.yml",
});

const fromWeb = await getDereferencedOpenAPIDocument({
  location: "web",
  webURL: "https://api.apis.guru/v2/specs/googleapis.com/books/v1/openapi.yaml",
});

const zodSchema = openAPISchemaToZod({
  type: "object",
  required: ["age"],
  properties: {
    name: { type: "string", minLength: 2 },
    age: { type: "integer", minimum: 0 },
    email: { type: "string", format: "email" },
    tags: { type: "array", items: { type: "string" }, minItems: 1 },
  },
});
zodSchema.parse({ name: "Ada", age: 25, email: "ada@example.com", tags: ["dev"] });

const openAPISchema = zodToOpenAPISchema(
  z.object({
    name: z.string().min(2).describe("Full name"),
    age: z.number().int().min(0),
    email: z.email().optional(),
    tags: z.array(z.string()).min(1),
  }),
);
```

`openAPISchemaToZod` supports `string`, `number`, `integer`, `boolean`, `object`, `array`, `enum`, `minLength`, `maxLength`, `pattern`, string `format` (email, uuid, url, date-time, date), `minimum` / `maximum`, `exclusiveMinimum` / `exclusiveMaximum`, `multipleOf`, `minItems` / `maxItems`, `allOf` (`.and()`), `anyOf` / `oneOf` (`.union()`), `nullable`, object `required`, and a `$ref` that is already resolved.

`zodToOpenAPISchema` writes `required` without `.optional()` fields, `.nullable()`, string min/max/regex/formats, number min/max (inclusive and exclusive), `multipleOf`, integer, array `minItems` / `maxItems`, `z.enum` (string enums and numeric member tuples; Zod 4 folded `z.nativeEnum` into `z.enum`), `z.union` as `anyOf`, `.describe()`, `ZodDate`, and `ZodBigInt`.

`json-schema-to-zod` and `zod-to-json-schema` cover cases these two functions do not.
