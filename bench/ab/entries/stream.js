import { z as zod } from "zod";
import {
  createAgUiPartialValidator,
  createStreamValidator,
} from "@adaptate/core/stream";

import { orderDocument, orderSchema, receiptConfig } from "../order.js";

const base = orderSchema(zod, "partial");
const validator = createStreamValidator(base, { receipt: receiptConfig });
const push = createAgUiPartialValidator(base, { receipt: receiptConfig });

export function validate(document) {
  return validator.partial(document).receipt.valid;
}

export const ready =
  validate(orderDocument) === true && typeof push === "function";
