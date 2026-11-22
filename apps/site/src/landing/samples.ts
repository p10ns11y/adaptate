export let samples = {
  schema: `{
  "type": "object",
  "required": ["title", "servings"],
  "properties": {
    "title": { "type": "string", "minLength": 1 },
    "servings": { "type": "integer", "minimum": 1 },
    "diet": { "type": "string", "enum": ["vegan", "keto", "any"] },
    "tags": { "type": "array", "items": { "type": "string" } }
  }
}`,
  openapi: `{
  "openapi": "3.1.0",
  "components": {
    "schemas": {
      "Recipe": {
        "type": "object",
        "required": ["title", "author"],
        "properties": {
          "title": { "type": "string", "minLength": 1 },
          "author": { "$ref": "#/components/schemas/Author" }
        }
      },
      "Author": {
        "type": "object",
        "required": ["email"],
        "properties": { "email": { "type": "string", "format": "email" } }
      }
    }
  }
}`,
};

export let payloads = {
  schema: {
    valid: `{ "title": "Pasta al limone", "servings": 4, "diet": "vegan", "tags": ["quick"] }`,
    failing: `{ "title": "", "servings": 0, "diet": "paleo" }`,
  },
  openapi: {
    valid: `{ "title": "Pasta al limone", "author": { "email": "cook@example.com" } }`,
    failing: `{ "title": "Pasta al limone", "author": { "email": "not-an-email" } }`,
  },
};

export type SampleName = keyof typeof samples;
