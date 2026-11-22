import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { absoluteUrl, indexable, resolveSiteUrl, slugFor } from "../src/site/config.ts";
import { buildAgentIndexes } from "../../../tools/api-docs/llms.mjs";
import { renderOgHtml } from "../src/site/og.ts";
import { rewriteLlms } from "../src/site/llms.ts";

let siteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let repositoryRoot = resolve(siteDirectory, "../..");
let distDirectory = join(siteDirectory, "dist");
let siteUrl = resolveSiteUrl(process.env.SITE_URL);
let routes = JSON.parse(readFileSync(join(siteDirectory, ".site-meta/routes.json"), "utf8"));
let palette = JSON.parse(readFileSync(join(siteDirectory, "palette.json"), "utf8")).tokens;
let markSvg = readFileSync(join(siteDirectory, "public/mark.svg"), "utf8");
let faviconSvg = readFileSync(join(siteDirectory, "public/favicon.svg"), "utf8");

let sitemap = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ...routes.map((route) => `  <url><loc>${absoluteUrl(siteUrl, route.path)}</loc></url>`),
  `</urlset>`,
  "",
].join("\n");
writeFileSync(join(distDirectory, "sitemap.xml"), sitemap);

let robots = [
  "User-agent: *",
  indexable ? "Allow: /" : "Disallow: /",
  "",
  `Sitemap: ${absoluteUrl(siteUrl, "/sitemap.xml")}`,
  "",
].join("\n");
writeFileSync(join(distDirectory, "robots.txt"), robots);

let indexes = buildAgentIndexes(repositoryRoot);
writeFileSync(join(distDirectory, "llms.txt"), rewriteLlms(indexes.llms, siteUrl));
writeFileSync(join(distDirectory, "llms-full.txt"), rewriteLlms(indexes.llmsFull, siteUrl));

let browser = await chromium.launch();
try {
  let page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  mkdirSync(join(distDirectory, "og"), { recursive: true });
  for (let route of routes) {
    await page.setContent(renderOgHtml(route, markSvg, palette));
    await page.screenshot({ path: join(distDirectory, "og", `${slugFor(route.path)}.png`) });
  }
  let icon = async (svg, size, file, background) => {
    await page.setViewportSize({ width: size, height: size });
    let fill = background ?? "transparent";
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:${fill}"><div style="width:${size}px;height:${size}px">${svg.replace("<svg ", `<svg style="display:block;width:${size}px;height:${size}px" `)}</div></body></html>`,
    );
    await page.screenshot({ path: join(distDirectory, file), omitBackground: background === undefined });
  };
  await icon(faviconSvg, 32, "favicon-32.png");
  await icon(markSvg, 180, "apple-touch-icon.png", palette.void.hex);
} finally {
  await browser.close();
}

console.log(`Wrote ${routes.length} og images, icons, sitemap.xml, robots.txt, and llms files.`);
