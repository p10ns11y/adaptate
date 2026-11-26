import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

import { resolveSiteUrl } from "./src/site/config.ts";
import { escapeHtml, renderHead } from "./src/site/head.ts";
import { renderFooter, renderHeader } from "./src/site/header.ts";
import { renderAgents, renderCards, renderEyebrow, renderHeading, renderInstall, renderProof, renderRailIntro } from "./src/site/landing-copy.ts";
import { renderDemo } from "./src/site/landing-demo.ts";
import { renderHeroArt, renderPadArt, renderTrailArt } from "./src/site/media.ts";
import { renderRailConsole } from "./src/site/rail.ts";
import { landingRoute, loadRoute, type SiteRoute } from "./src/site/routes.ts";

let siteDirectory = dirname(fileURLToPath(import.meta.url));
let repositoryRoot = resolve(siteDirectory, "../..");
let metaDirectory = join(siteDirectory, ".site-meta");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sitePages(): Plugin {
  let siteUrl = resolveSiteUrl(process.env.SITE_URL);
  let version = readJson<{ version: string }>(join(repositoryRoot, "packages/core/package.json")).version;
  let demo = renderDemo();
  let routeFor = (path: string): SiteRoute => (path.startsWith("/load/") ? loadRoute : landingRoute);
  return {
    name: "adaptate-site-pages",
    transformIndexHtml(html, context) {
      let route = routeFor(context.path);
      return html
        .replace("<!--site-head-->", renderHead(route, { siteUrl, version }))
        .replace("<!--site-header-->", renderHeader(route.kind))
        .replace("<!--site-footer-->", renderFooter())
        .replace("<!--site-eyebrow-->", renderEyebrow())
        .replace("<!--site-heading-->", route.kind === "landing" ? renderHeading() : escapeHtml(route.heading))
        .replace("<!--site-answer-->", escapeHtml(route.answer))
        .replace("<!--site-install-->", renderInstall())
        .replace("<!--site-demo-->", demo)
        .replace("<!--site-cards-->", renderCards())
        .replace("<!--site-rail-->", `${renderRailIntro()}${renderRailConsole()}`)
        .replace("<!--site-proof-->", renderProof())
        .replace("<!--site-agents-->", renderAgents())
        .replace("<!--site-hero-art-->", renderHeroArt())
        .replace("<!--site-trail-art-->", renderTrailArt())
        .replace("<!--site-pad-art-->", renderPadArt());
    },
    generateBundle(_options, bundle) {
      let modules: Record<string, string[]> = {};
      let liveBenchmark = "";
      for (let [fileName, output] of Object.entries(bundle)) {
        if (output.type === "chunk") {
          modules[fileName] = Object.keys(output.modules);
          if (output.name === "live-benchmark" && output.isEntry) liveBenchmark = fileName;
        }
      }
      mkdirSync(metaDirectory, { recursive: true });
      writeFileSync(join(metaDirectory, "modules.json"), `${JSON.stringify(modules, null, 2)}\n`);
      if (!liveBenchmark) throw new Error("live-benchmark entry was not emitted");
      writeFileSync(join(metaDirectory, "live-benchmark.json"), `${JSON.stringify({ fileName: liveBenchmark }, null, 2)}\n`);
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
        "live-benchmark": join(siteDirectory, "src/bench/live-benchmark.ts"),
      },
    },
  },
  resolve: {
    alias: {
      "@adaptate/wasm/runtime": resolve(repositoryRoot, "packages/wasm/src/runtime.ts"),
      "@adaptate/core/verify": resolve(repositoryRoot, "packages/core/src/verify.ts"),
    },
  },
});
