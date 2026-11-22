import { z as zod } from "zod";
import { transformSchema } from "@adaptate/core";
import {
  createAgUiPartialValidator,
  createStreamValidator,
  parsePartialJson,
} from "@adaptate/core/stream";

import { createAdaptateApp } from "../adaptate-app.js";
import { orderDocument } from "../order.js";

export const app = createAdaptateApp(
  zod,
  { transformSchema },
  { createAgUiPartialValidator, createStreamValidator, parsePartialJson },
);

export function validateCold() {
  return app.validateFull(orderDocument);
}
