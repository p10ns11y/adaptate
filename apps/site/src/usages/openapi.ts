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
