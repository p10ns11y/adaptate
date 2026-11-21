import { microsPerChunk, operationsPerSecond } from "./loops.js";
import { orderDocument } from "./order.js";
import { median } from "./stats.js";

export function measureOnce(app, deltas, partials, budgetMs, nowNs, part = "all") {
  let checksum = 0;
  let validationsPerSec = 0;
  let viewsPerSec = 0;
  let partialMicros = 0;
  let agUiMicros = 0;
  let repairMicros = null;
  if (part === "all" || part === "rate") {
    validationsPerSec = operationsPerSecond(() => {
      if (app.validateFull(orderDocument)) checksum += 1;
    }, budgetMs, nowNs);
  }
  if (part === "all" || part === "views") {
    viewsPerSec = operationsPerSecond(() => {
      if (app.validateViews(orderDocument)) checksum += 1;
    }, budgetMs, nowNs);
  }
  if (
    part === "all" ||
    part === "partial" ||
    (part === "agui" && typeof app.openStream !== "function")
  ) {
    partialMicros = microsPerChunk(() => {
      for (const partial of partials) {
        if (app.validatePartial(partial) === true) checksum += 1;
      }
    }, partials.length, budgetMs, nowNs);
    agUiMicros = partialMicros;
  }
  if ((part === "all" || part === "agui") && typeof app.openStream === "function") {
    agUiMicros = microsPerChunk(() => {
      const push = app.openStream();
      for (const delta of deltas) {
        if (push(delta) === true) checksum += 1;
      }
    }, deltas.length, budgetMs, nowNs);
  }
  if (part === "repair" && typeof app.repairStream !== "function") {
    return {
      validationsPerSec,
      viewsPerSec,
      agUiMicros,
      partialMicros,
      repairMicros: null,
      checksum: 1,
    };
  }
  if ((part === "all" || part === "repair") && typeof app.repairStream === "function") {
    repairMicros = microsPerChunk(() => {
      const repair = app.repairStream();
      for (const delta of deltas) {
        if (repair(delta) !== undefined) checksum += 1;
      }
    }, deltas.length, budgetMs, nowNs);
  }
  if (checksum === 0) throw new Error(`${app.name} ${part} measured only failures`);
  return { validationsPerSec, viewsPerSec, agUiMicros, partialMicros, repairMicros, checksum };
}

export function measurePhases(app, deltas, partials, rounds, budgetMs, nowNs) {
  const rates = [];
  const viewSamples = [];
  const partialSamples = [];
  for (let round = 0; round < rounds; round += 1) {
    rates.push(
      measureOnce(app, deltas, partials, budgetMs, nowNs, "rate").validationsPerSec,
    );
  }
  for (let round = 0; round < rounds; round += 1) {
    viewSamples.push(
      measureOnce(app, deltas, partials, budgetMs, nowNs, "views").viewsPerSec,
    );
  }
  for (let round = 0; round < rounds; round += 1) {
    partialSamples.push(
      measureOnce(app, deltas, partials, budgetMs, nowNs, "partial").partialMicros,
    );
  }
  let agUiSamples = partialSamples;
  if (typeof app.openStream === "function") {
    agUiSamples = [];
    for (let round = 0; round < rounds; round += 1) {
      agUiSamples.push(
        measureOnce(app, deltas, partials, budgetMs, nowNs, "agui").agUiMicros,
      );
    }
  }
  let repairMicros = null;
  if (typeof app.repairStream === "function") {
    const repairSamples = [];
    for (let round = 0; round < rounds; round += 1) {
      repairSamples.push(
        measureOnce(app, deltas, partials, budgetMs, nowNs, "repair").repairMicros,
      );
    }
    repairMicros = median(repairSamples);
  }
  return {
    validationsPerSec: median(rates),
    viewsPerSec: median(viewSamples),
    partialMicros: median(partialSamples),
    agUiMicros: median(agUiSamples),
    repairMicros,
  };
}
