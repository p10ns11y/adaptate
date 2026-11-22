import { readFileSync } from "node:fs";

import { nodeNowNs } from "./clock.js";
import { reportBudgetMs, reportRounds } from "./config.js";
import { adaptateStreamForBench, libraryHref } from "./load.js";
import {
  decodePartials,
  orderDocument,
  toolCallDeltas,
} from "./order.js";
import { measurePhases } from "./sample.js";

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

process.stdout.write(
  JSON.stringify(
    measurePhases(app, deltas, partials, reportRounds, reportBudgetMs, nodeNowNs),
  ),
);
