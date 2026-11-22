---
title: "OpenAPI"
description: "Turn an OpenAPI schema into Zod, and write a Zod schema back out."
answer: "@adaptate/utils converts an OpenAPI schema to Zod with openAPISchemaToZod, writes a Zod schema back out with zodToOpenAPISchema, and loads a spec from disk or the web with full $ref resolution."
faq:
  - question: "Can I load a YAML spec?"
    answer: "Yes, with getDereferencedOpenAPIDocument. Install the optional peer js-yaml to parse YAML."
  - question: "Can a converted schema have views?"
    answer: "Yes. openAPISchemaToZod returns a Zod object, and transformSchema adds the per-view required fields."
  - question: "Which OpenAPI keywords are supported?"
    answer: "Types, enums, string formats and lengths, number bounds, array bounds, allOf, anyOf, oneOf, nullable, required, and resolved $ref."
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

## Views from an OpenAPI schema

The file below is typechecked and run by the site tests. It converts an OpenAPI object to Zod, then requires the title for a card view.

<!-- snippet: usages/openapi.ts -->
```ts
import { transformSchema } from "@adaptate/core";
import { openAPISchemaToZod } from "@adaptate/utils/openapi";
import { z } from "zod";

export let orderOpenApiSchema = {
  type: "object",
  required: ["title"],
  properties: {
    title: { type: "string" },
    notes: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["sku", "qty"],
        properties: {
          sku: { type: "string" },
          qty: { type: "integer" },
        },
      },
    },
  },
};

let cardSchema: z.ZodType | undefined;

export function cardSchemaFromOpenApi(): z.ZodType {
  if (cardSchema) return cardSchema;
  let converted = openAPISchemaToZod(orderOpenApiSchema);
  if (!(converted instanceof z.ZodObject)) {
    throw new Error("OpenAPI order schema was not an object");
  }
  cardSchema = transformSchema(converted, { title: true });
  return cardSchema;
}

export function openApiCardReady(order: { title?: string }): boolean {
  return cardSchemaFromOpenApi().safeParse(order).success;
}
```
<!-- /snippet -->
