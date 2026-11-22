import { createAgUiPartialValidator as createReparseAgUi } from "@adaptate/core/stream";
import { createAgUiPartialValidator as createIncrementalAgUi } from "@adaptate/core/stream-incremental";

import { cardConfig, orderSchema } from "../order-schema";

export function createReparseOrderValidator() {
  return createReparseAgUi(orderSchema, { card: cardConfig });
}

export function createIncrementalOrderValidator() {
  return createIncrementalAgUi(orderSchema, { card: cardConfig });
}
