import { validateStructuredOutput } from "@adaptate/core/stream";
import type { z } from "zod";

import { cardConfig, orderSchema } from "../order-schema";

export function checkTanStackStream(output: {
  partial?: Partial<z.infer<typeof orderSchema>> | null;
  final?: z.infer<typeof orderSchema> | null;
}) {
  return validateStructuredOutput(output, orderSchema, { card: cardConfig });
}
