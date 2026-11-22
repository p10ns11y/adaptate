import { z as zod } from "zod";
import {
  createAgUiPartialValidator,
  createPartialJsonFeed,
  fromAsyncIterable,
} from "@adaptate/core/stream-incremental";

import { orderDocument, orderSchema, receiptConfig } from "../order.js";

const base = orderSchema(zod, "partial");
const push = createAgUiPartialValidator(base, { receipt: receiptConfig });
const feed = createPartialJsonFeed();

export const ready =
  typeof push === "function" &&
  typeof push.close === "function" &&
  typeof feed === "function" &&
  typeof fromAsyncIterable === "function" &&
  JSON.stringify(orderDocument).length > 0;
