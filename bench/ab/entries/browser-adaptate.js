import { z as zod } from "zod";
import { transformSchema } from "@adaptate/core";
import {
  createStreamValidator,
  parsePartialJson,
} from "@adaptate/core/stream";
import { createAgUiPartialValidator } from "@adaptate/core/stream-incremental";

import { createAdaptateApp } from "../adaptate-app.js";
import { orderDocument, toolCallDeltas } from "../order.js";
import { measurePhases } from "../sample.js";

const app = createAdaptateApp(
  zod,
  { transformSchema },
  { createAgUiPartialValidator, createStreamValidator, parsePartialJson },
);

const workload = toolCallDeltas(orderDocument);

function nowNs() {
  return performance.now() * 1e6;
}

export function ready() {
  return app.validateFull(orderDocument);
}

export function report(partials, rounds, budgetMs) {
  return measurePhases(
    app,
    workload.deltas,
    partials,
    rounds,
    budgetMs,
    nowNs,
  );
}
