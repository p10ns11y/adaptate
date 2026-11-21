import { libraryHref } from "./load.js";
import { orderDocument } from "./order.js";

const variant = process.env.AB_VARIANT;
const root = process.env.AB_ROOT || "";
const started = process.hrtime.bigint();

let accepted = false;
if (!root && variant === "zod") {
  const entry = await import("./entries/app-zod.js");
  accepted = entry.validateCold();
} else if (!root && variant === "adaptate") {
  const entry = await import("./entries/app-adaptate.js");
  accepted = entry.validateCold();
} else if (!root && variant === "valibot") {
  const entry = await import("./entries/app-valibot.js");
  accepted = entry.validateCold();
} else if (variant === "zod") {
  const zodModule = await import(libraryHref(root, "zod"));
  const { createZodApp } = await import("./zod-app.js");
  accepted = createZodApp(zodModule.z).validateFull(orderDocument);
} else if (variant === "adaptate") {
  const zodModule = await import(libraryHref(root, "zod"));
  const adaptateCore = await import(libraryHref(root, "@adaptate/core"));
  const adaptateStream = await import(
    libraryHref(root, "@adaptate/core/stream")
  );
  const { createAdaptateApp } = await import("./adaptate-app.js");
  accepted = createAdaptateApp(
    zodModule.z,
    adaptateCore,
    adaptateStream,
  ).validateFull(orderDocument);
} else if (variant === "valibot") {
  const { createValibotApp } = await import("./valibot-app.js");
  accepted = createValibotApp().validateFull(orderDocument);
} else {
  throw new Error(`unknown variant ${variant}`);
}

if (!accepted) throw new Error(`${variant} rejected the order during cold start`);
process.stdout.write(String(process.hrtime.bigint() - started));
