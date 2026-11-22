import { readFileSync } from "node:fs";

import { heapValidations } from "./config.js";
import { adaptateStreamForBench, libraryHref } from "./load.js";
import { decodePartials, orderDocument, toolCallDeltas } from "./order.js";

function collectGarbage() {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
    return "gc";
  }
  if (typeof Bun !== "undefined" && typeof Bun.gc === "function") {
    Bun.gc(true);
    return "bun";
  }
  return "";
}

const variant = process.env.AB_VARIANT;
const root = process.env.AB_ROOT || "";
const partials = decodePartials(
  JSON.parse(readFileSync(process.env.AB_PARTIALS, "utf8")),
);
const { deltas } = toolCallDeltas(orderDocument);

let app;
if (variant === "zod") {
  const zodModule = await import(libraryHref(root, "zod"));
  const { createZodApp } = await import("./zod-app.js");
  app = createZodApp(zodModule.z);
} else if (variant === "adaptate") {
  const zodModule = await import(libraryHref(root, "zod"));
  const adaptateCore = await import(libraryHref(root, "@adaptate/core"));
  const adaptateStream = await adaptateStreamForBench(root);
  const { createAdaptateApp } = await import("./adaptate-app.js");
  app = createAdaptateApp(zodModule.z, adaptateCore, adaptateStream);
} else if (variant === "valibot") {
  const { createValibotApp } = await import("./valibot-app.js");
  app = createValibotApp();
} else {
  throw new Error(`unknown variant ${variant}`);
}

const collector = collectGarbage();
if (!collector) {
  process.stdout.write(JSON.stringify({ available: false }));
  process.exit(0);
}
collectGarbage();
const baseline = process.memoryUsage().heapUsed;
let checksum = 0;
for (let index = 0; index < heapValidations; index += 1) {
  if (app.validateFull(orderDocument)) checksum += 1;
}
if (typeof app.openStream === "function") {
  const push = app.openStream();
  for (const delta of deltas) {
    if (push(delta) === true) checksum += 1;
  }
} else {
  for (const partial of partials) {
    if (app.validatePartial(partial) === true) checksum += 1;
  }
}
collectGarbage();
collectGarbage();
const after = process.memoryUsage().heapUsed;
process.stdout.write(
  JSON.stringify({
    available: true,
    collector,
    baseline,
    after,
    delta: after - baseline,
    checksum,
  }),
);
