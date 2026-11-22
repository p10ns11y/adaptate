import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgUiPartialValidator } from "@adaptate/core/stream";
import { defineConfig, type Plugin } from "vite";
import { z } from "zod";

import { resolveSiteUrl } from "./src/site/config.ts";
import { renderHead } from "./src/site/head.ts";
import { renderFooter, renderHeader } from "./src/site/header.ts";
import { renderBeforeAfter, renderExamplesFallback, renderMeasured, type PerfRun } from "./src/site/landing-content.ts";
import { landingRoute, loadRoute, type SiteRoute } from "./src/site/routes.ts";

let siteDirectory = dirname(fileURLToPath(import.meta.url));
let repositoryRoot = resolve(siteDirectory, "../..");
let metaDirectory = join(siteDirectory, ".site-meta");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function streamDemo() {
  let delta = '{"title":"Pas';
  let jsonParseError = "";
  try {
    JSON.parse(delta);
  } catch (error) {
    jsonParseError = error instanceof Error ? error.message : String(error);
  }
  let push = createAgUiPartialValidator(z.object({ title: z.string(), servings: z.number() }), {
    card: { title: true },
  });
  let check = push({ type: "TOOL_CALL_ARGS", toolCallId: "call-1", delta });
  if (!check) throw new Error("The stream demo produced no check");
  return { delta, jsonParseError, partial: check.partial, cardValid: check.results.card.valid };
}

function sitePages(): Plugin {
  let siteUrl = resolveSiteUrl(process.env.SITE_URL);
  let version = readJson<{ version: string }>(join(repositoryRoot, "packages/core/package.json")).version;
  let perf = readJson<PerfRun>(join(repositoryRoot, "assets/perf-run.json"));
  let demo = streamDemo();
  let firstExample = readFileSync(join(siteDirectory, "src/usages/react-view.tsx"), "utf8");
  let routeFor = (path: string): SiteRoute => (path.startsWith("/load/") ? loadRoute : landingRoute);
  return {
    name: "adaptate-site-pages",
    transformIndexHtml(html, context) {
      let route = routeFor(context.path);
      return html
        .replace("<!--site-head-->", renderHead(route, { siteUrl, version }))
        .replace("<!--site-header-->", renderHeader(route.kind))
        .replace("<!--site-footer-->", renderFooter())
        .replace("<!--site-answer-->", route.answer)
        .replace("<!--site-before-after-->", renderBeforeAfter(demo))
        .replace("<!--site-measured-->", renderMeasured(perf))
        .replace("<!--site-examples-->", renderExamplesFallback("react-view.tsx", firstExample));
    },
    generateBundle(_options, bundle) {
      let modules: Record<string, string[]> = {};
      for (let [fileName, output] of Object.entries(bundle)) {
        if (output.type === "chunk") modules[fileName] = Object.keys(output.modules);
      }
      mkdirSync(metaDirectory, { recursive: true });
      writeFileSync(join(metaDirectory, "modules.json"), `${JSON.stringify(modules, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  plugins: [sitePages()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        main: join(siteDirectory, "index.html"),
        load: join(siteDirectory, "load/index.html"),
      },
    },
  },
});
