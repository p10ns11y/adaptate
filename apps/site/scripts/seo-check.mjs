import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { absoluteUrl, indexable, resolveSiteUrl, slugFor } from "../src/site/config.ts";
import { checkPage, extractPage } from "../src/site/seo-rules.ts";
import { startStaticServer } from "./static-server.mjs";

let siteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let distDirectory = resolve(process.argv[2] ?? join(siteDirectory, "dist"));
let manifestPath = resolve(process.argv[3] ?? join(siteDirectory, ".site-meta/routes.json"));
let siteUrl = resolveSiteUrl(process.env.SITE_URL);
let routes = JSON.parse(readFileSync(manifestPath, "utf8"));
let routeByPath = new Map(routes.map((route) => [route.path, route]));
let failures = [];

function walk(directory) {
  let files = [];
  for (let entry of readdirSync(directory, { withFileTypes: true })) {
    let path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

function pngSize(path) {
  let bytes = readFileSync(path);
  if (bytes.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

let files = walk(distDirectory);
let htmlRoutes = files
  .filter((path) => path.endsWith("index.html"))
  .map((path) => `/${relative(distDirectory, dirname(path)).replaceAll("\\", "/")}/`.replace(/^\/\/$/, "/"));

let byText = (left, right) => left.localeCompare(right);
let manifestPaths = [...routeByPath.keys()].sort(byText);
let builtPaths = [...htmlRoutes].sort(byText);
for (let path of builtPaths) if (!routeByPath.has(path)) failures.push(`${path}: HTML page is not in the routes manifest`);
for (let path of manifestPaths) if (!builtPaths.includes(path)) failures.push(`${path}: manifest route has no HTML page`);

let sitemapPath = join(distDirectory, "sitemap.xml");
if (!existsSync(sitemapPath)) {
  failures.push("sitemap.xml is missing");
} else {
  let locations = [...readFileSync(sitemapPath, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort(byText);
  let expected = manifestPaths.map((path) => absoluteUrl(siteUrl, path)).sort(byText);
  if (JSON.stringify(locations) !== JSON.stringify(expected)) failures.push("sitemap.xml routes differ from the routes manifest");
}

let robotsPath = join(distDirectory, "robots.txt");
let robots = existsSync(robotsPath) ? readFileSync(robotsPath, "utf8") : "";
if (!indexable && !/^Disallow: \/$/m.test(robots)) failures.push("robots.txt must Disallow: / until the public domain is approved");

for (let name of ["llms.txt", "llms-full.txt"]) {
  let path = join(distDirectory, name);
  if (!existsSync(path)) failures.push(`${name} is missing`);
  else if (/\]\(docs\//.test(readFileSync(path, "utf8"))) failures.push(`${name} still has repository-relative docs links`);
}

for (let route of routes) {
  let path = join(distDirectory, "og", `${slugFor(route.path)}.png`);
  if (!existsSync(path)) {
    failures.push(`${route.path}: og image og/${slugFor(route.path)}.png is missing`);
    continue;
  }
  let size = pngSize(path);
  if (!size || size.width !== 1200 || size.height !== 630) failures.push(`${route.path}: og image is not 1200x630`);
}

let credits = readFileSync(join(siteDirectory, "../../docs/credits.md"), "utf8");
let sourceOwners = [...new Set([...credits.matchAll(/\bx\.com\/([\w-]+)\/status\//g)].map((match) => match[1]))];
if (sourceOwners.length === 0) failures.push("docs/credits.md lists no palette sources");
let forbidden = new RegExp(sourceOwners.join("|") || "(?!)", "i");
for (let path of files) {
  if (![".html", ".css", ".js", ".txt", ".xml", ".svg", ".json"].includes(extname(path))) continue;
  if (forbidden.test(readFileSync(path, "utf8"))) failures.push(`${relative(distDirectory, path)}: names a source company or vehicle`);
}

let server = await startStaticServer(distDirectory);
let browser = await chromium.launch();
try {
  let page = await browser.newPage();
  for (let path of builtPaths) {
    let route = routeByPath.get(path);
    if (!route) continue;
    await page.goto(`${server.origin}${path}`, { waitUntil: "load" });
    let extracted = await page.evaluate(extractPage);
    for (let issue of checkPage(extracted, route, siteUrl)) failures.push(`${path}: ${issue}`);
  }
  for (let path of ["/", "/load/", "/docs/"]) {
    await page.goto(`${server.origin}${path}`);
    if (!(await page.evaluate(() => globalThis.crossOriginIsolated))) failures.push(`${path}: not cross-origin isolated with vercel.json headers`);
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `seo-check: ${failure}`).join("\n"));
  console.error(`seo-check failed with ${failures.length} issue(s).`);
  process.exit(1);
}
console.log(`seo-check passed on ${builtPaths.length} routes.`);
