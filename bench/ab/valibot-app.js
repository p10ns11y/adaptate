import {
  array,
  number,
  object,
  optional,
  picklist,
  safeParse,
  string,
} from "valibot";

import { orderDocument } from "./order.js";

const fulfillmentMethods = ["pickup", "courier"];

function requireSchema(required, schema) {
  return required ? schema : optional(schema);
}

function orderSchema(mode) {
  const strict = mode === "strict";
  const text = (required) => requireSchema(required, string());
  const amount = (required) => requireSchema(required, number());
  const method = (required) =>
    requireSchema(required, picklist(fulfillmentMethods));
  return object({
    orderId: text(strict),
    placedAt: text(false),
    customer: requireSchema(
      strict,
      object({
        name: text(strict),
        email: text(strict),
        phone: text(false),
      }),
    ),
    items: requireSchema(
      strict,
      array(
        object({
          sku: text(strict),
          name: text(false),
          qty: amount(strict),
          unitPrice: amount(false),
        }),
      ),
    ),
    fulfillment: requireSchema(
      strict,
      object({
        method: method(strict),
        address: requireSchema(
          strict,
          object({
            line1: text(false),
            city: text(strict),
            postalCode: text(strict),
            country: text(false),
          }),
        ),
        windowStart: text(false),
        windowEnd: text(false),
      }),
    ),
    notes: text(false),
  });
}

const strict = orderSchema("strict");
const partial = orderSchema("partial");
const card = object({
  orderId: string(),
  customer: object({ name: string() }),
});
const items = object({
  items: array(object({ sku: string(), qty: number() })),
});
const delivery = object({
  fulfillment: object({
    method: picklist(fulfillmentMethods),
    address: object({ city: string(), postalCode: string() }),
  }),
});
const viewSchemas = [card, items, delivery, strict];

export function createValibotApp() {
  return {
    name: "valibot",
    validateFull(document = orderDocument) {
      return safeParse(strict, document).success;
    },
    validateViews(document = orderDocument) {
      let readyViews = 0;
      for (const viewSchema of viewSchemas) {
        if (safeParse(viewSchema, document).success) readyViews += 1;
      }
      return readyViews === viewSchemas.length;
    },
    validatePartial(document) {
      if (document === undefined) return undefined;
      return safeParse(partial, document).success;
    },
  };
}
