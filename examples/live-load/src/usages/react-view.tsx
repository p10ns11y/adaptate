import { useMemo } from "react";
import type { Config } from "@adaptate/core";
import { transformSchema } from "@adaptate/core";
import type { z } from "zod";

import { cardConfig, partialOrderSchema } from "../order-schema";

export function useViewSchema<TSchema extends z.ZodType>(
  schema: TSchema,
  config: Config<z.infer<TSchema>>,
) {
  return useMemo(() => transformSchema(schema, config), [schema, config]);
}

export function OrderCard({ order }: { order: { title?: string } }) {
  let cardSchema = useViewSchema(partialOrderSchema, cardConfig);
  let parsed = cardSchema.safeParse(order);
  if (!parsed.success) {
    return <p>The card is not ready.</p>;
  }
  return <p>{parsed.data.title}</p>;
}
