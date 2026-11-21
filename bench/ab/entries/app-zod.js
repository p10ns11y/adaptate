import { z as zod } from "zod";

import { createZodApp } from "../zod-app.js";
import { orderDocument } from "../order.js";

export const app = createZodApp(zod);

export function validateCold() {
  return app.validateFull(orderDocument);
}
