import { z as zod } from "zod";
import { transformSchema } from "@adaptate/core";

import { orderDocument, orderSchema, receiptConfig } from "../order.js";

const schema = transformSchema(orderSchema(zod, "partial"), receiptConfig);

export function validate(document) {
  return schema.safeParse(document).success;
}

export const ready = validate(orderDocument);
