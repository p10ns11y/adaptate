import { createValibotApp } from "../valibot-app.js";
import { orderDocument } from "../order.js";

export const app = createValibotApp();

export function validateCold() {
  return app.validateFull(orderDocument);
}
