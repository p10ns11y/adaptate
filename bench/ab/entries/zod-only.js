import { z as zod } from "zod";

import { orderDocument, orderSchema } from "../order.js";

const schema = orderSchema(zod, "strict");

export function validate(document) {
  return schema.safeParse(document).success;
}

export const ready = validate(orderDocument);
