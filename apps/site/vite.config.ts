import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

import { resolveSiteUrl } from "./src/site/config.ts";
import { escapeHtml, renderHead } from "./src/site/head.ts";
import { renderFooter, renderHeader } from "./src/site/header.ts";
import { renderAgents, renderCards, renderInstall, renderProof } from "./src/site/landing-copy.ts";
import { renderDemo } from "./src/site/landing-demo.ts";
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
        .replace("<!--site-heading-->", escapeHtml(route.heading))
        .replace("<!--site-answer-->", escapeHtml(route.answer))
        .replace("<!--site-install-->", renderInstall())
        .replace("<!--site-demo-->", demo)
        .replace("<!--site-cards-->", renderCards())
        .replace("<!--site-proof-->", renderProof())
        .replace("<!--site-agents-->", renderAgents());
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
