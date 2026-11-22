import { createAdaptateApp } from "./adaptate-app.js";
import { adaptateStreamForBench, libraryHref } from "./load.js";
import { createValibotApp } from "./valibot-app.js";
import { createZodApp } from "./zod-app.js";

function zodNamespace(zodModule) {
  const zod = zodModule.z ?? zodModule.default?.z;
  if (!zod) throw new Error("zod module did not export z");
  return zod;
}

export async function createApps(root) {
  const zodModule = await import(libraryHref(root, "zod"));
  const adaptateCore = await import(libraryHref(root, "@adaptate/core"));
  const adaptateStream = await adaptateStreamForBench(root);
  const zod = zodNamespace(zodModule);
  return {
    zod: createZodApp(zod),
    adaptate: createAdaptateApp(zod, adaptateCore, adaptateStream),
    valibot: createValibotApp(),
    parsePartialJson: adaptateStream.parsePartialJson,
  };
}
