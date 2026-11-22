import { orderDocument, orderSchema } from "./order.js";

export function createZodApp(zod) {
  const strict = orderSchema(zod, "strict");
  const partial = orderSchema(zod, "partial");
  const card = zod.object({
    orderId: zod.string(),
    customer: zod.object({ name: zod.string() }),
  });
  const items = zod.object({
    items: zod.array(zod.object({ sku: zod.string(), qty: zod.number() })),
  });
  const delivery = zod.object({
    fulfillment: zod.object({
      method: zod.enum(["pickup", "courier"]),
      address: zod.object({ city: zod.string(), postalCode: zod.string() }),
    }),
  });
  const viewSchemas = [card, items, delivery, strict];
  return {
    name: "zod",
    validateFull(document = orderDocument) {
      return strict.safeParse(document).success;
    },
    validateViews(document = orderDocument) {
      let readyViews = 0;
      for (const viewSchema of viewSchemas) {
        if (viewSchema.safeParse(document).success) readyViews += 1;
      }
      return readyViews === viewSchemas.length;
    },
    validatePartial(document) {
      if (document === undefined) return undefined;
      return partial.safeParse(document).success;
    },
  };
}
