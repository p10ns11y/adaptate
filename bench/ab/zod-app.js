import { orderDocument, orderSchema } from "./order.js";

export function createZodApp(zod) {
  const strict = orderSchema(zod, "strict");
  const partial = orderSchema(zod, "partial");
  return {
    name: "zod",
    validateFull(document = orderDocument) {
      return strict.safeParse(document).success;
    },
    validatePartial(document) {
      if (document === undefined) return undefined;
      return partial.safeParse(document).success;
    },
  };
}
