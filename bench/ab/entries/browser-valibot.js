import { orderDocument, toolCallDeltas } from "../order.js";
import { measurePhases } from "../sample.js";
import { app } from "./app-valibot.js";

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
