import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

let siteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let distDirectory = join(siteDirectory, "dist");
let kilobyte = 1024;
let budgets = {
  landingJs: 75 * kilobyte,
  loadJs: 80 * kilobyte,
  workerJs: 70 * kilobyte,
  docsJs: 0,
  cssTotal: 12 * kilobyte,
  ogImage: 120 * kilobyte,
  clip: 2 * kilobyte * kilobyte,
};
let buildOnly = [/\/node_modules\/(\.pnpm\/)?effect[@/]/, /\/node_modules\/(\.pnpm\/)?marked[@/]/, /\/node_modules\/(\.pnpm\/)?mermaid[@/]/, /\/node_modules\/(\.pnpm\/)?playwright/];
let failures = [];
let report = [];

function walk(directory) {
  let files = [];
  for (let entry of readdirSync(directory, { withFileTypes: true })) {
    let path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

let gzipSize = (path) => gzipSync(readFileSync(path), { level: 9 }).length;
let format = (bytes) => `${(bytes / kilobyte).toFixed(1)} KB`;

function measure(label, bytes, limit) {
  report.push(`${label}: ${format(bytes)} of ${format(limit)}`);
  if (bytes > limit) failures.push(`${label} is ${format(bytes)}, over ${format(limit)}`);
}

function pageScripts(htmlPath) {
  let html = readFileSync(htmlPath, "utf8");
  let sources = new Set();
  for (let match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    let attributes = match[1] ?? "";
    if (/type="application\/ld\+json"/.test(attributes)) continue;
    let source = attributes.match(/src="([^"]+)"/);
    sources.add(source ? source[1] : "inline");
  }
  for (let match of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) sources.add(match[1]);
  return [...sources];
}

function scriptBytes(htmlPath) {
  let total = 0;
  for (let source of pageScripts(htmlPath)) {
    if (source === "inline") {
      total += 1;
      continue;
    }
    total += gzipSize(join(distDirectory, source.replace(/^\//, "")));
  }
  return total;
}

let files = walk(distDirectory);
measure("/ JS (gzip)", scriptBytes(join(distDirectory, "index.html")), budgets.landingJs);
measure("/load/ main-thread JS (gzip)", scriptBytes(join(distDirectory, "load/index.html")), budgets.loadJs);

for (let worker of files.filter((path) => /worker[^/]*\.js$/.test(path))) {
  measure(`${relative(distDirectory, worker)} (gzip)`, gzipSize(worker), budgets.workerJs);
}

let docsPages = files.filter((path) => path.startsWith(join(distDirectory, "docs")) && path.endsWith(".html"));
let docsWithScripts = docsPages.filter((path) => pageScripts(path).length > 0);
measure(`/docs/** JS across ${docsPages.length} pages`, docsWithScripts.reduce((sum, path) => sum + scriptBytes(path), 0), budgets.docsJs);

measure("CSS total (gzip)", files.filter((path) => path.endsWith(".css")).reduce((sum, path) => sum + gzipSize(path), 0), budgets.cssTotal);

let ogImages = files.filter((path) => path.includes(`${join(distDirectory, "og")}/`) && path.endsWith(".png"));
let largestOg = ogImages.reduce((largest, path) => Math.max(largest, statSync(path).size), 0);
measure(`largest of ${ogImages.length} og PNGs`, largestOg, budgets.ogImage);

let clip = join(distDirectory, "media/ascent.mp4");
if (existsSync(clip)) measure("media/ascent.mp4", statSync(clip).size, budgets.clip);

let modulesPath = join(siteDirectory, ".site-meta/modules.json");
if (!existsSync(modulesPath)) {
  failures.push(".site-meta/modules.json is missing; run the site build");
} else {
  let modules = JSON.parse(readFileSync(modulesPath, "utf8"));
  for (let [chunk, ids] of Object.entries(modules)) {
    for (let id of ids) {
      if (buildOnly.some((pattern) => pattern.test(id.replaceAll("\\", "/")))) failures.push(`${chunk} ships build-only module ${id}`);
    }
  }
  report.push(`build-only deps (effect, marked, mermaid, playwright): 0 bytes in ${Object.keys(modules).length} chunk(s)`);
}

console.log(report.join("\n"));
if (failures.length > 0) {
  console.error(failures.map((failure) => `budget: ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Budgets pass.");
