import type { Config } from "@adaptate/core";
import { z } from "zod";

export let orderSchema = z.object({
  title: z.string(),
  notes: z.string(),
  items: z.array(
    z.object({
      sku: z.string(),
      qty: z.number(),
    }),
  ),
});

export let partialOrderSchema = orderSchema.partial();

export let cardConfig = {
  title: true,
} satisfies Config<z.infer<typeof partialOrderSchema>>;
