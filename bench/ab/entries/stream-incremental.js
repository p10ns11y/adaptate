import { z as zod } from "zod";
import {
  createAgUiPartialValidator,
  createPartialJsonParser,
  fromAsyncIterable,
} from "@adaptate/core/stream-incremental";

import { orderDocument, orderSchema, receiptConfig } from "../order.js";

const base = orderSchema(zod, "partial");
const push = createAgUiPartialValidator(base, { receipt: receiptConfig });
const parser = createPartialJsonParser();

export const ready =
  typeof push === "function" &&
  typeof parser.push === "function" &&
  parser.visits === 0 &&
  typeof fromAsyncIterable === "function" &&
  JSON.stringify(orderDocument).length > 0;
