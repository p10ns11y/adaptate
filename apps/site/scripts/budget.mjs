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
  fireJs: 6 * kilobyte,
  docsJs: 2 * kilobyte,
  liveBenchmarkJs: 30 * kilobyte,
  cssTotal: 12 * kilobyte,
  ogImage: 120 * kilobyte,
  clip: 2 * kilobyte * kilobyte,
};
let buildOnly = [/\/node_modules\/(\.pnpm\/)?effect[@/]/, /\/node_modules\/(\.pnpm\/)?marked[@/]/, /\/node_modules\/(\.pnpm\/)?mermaid[@/]/, /\/node_modules\/(\.pnpm\/)?playwright/, /\/node_modules\/(\.pnpm\/)?(shiki|@shikijs)[@/]/];
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

let isSpace = (character) => character === " " || character === "\t" || character === "\n" || character === "\r" || character === "\f";

function readAttributes(html, start) {
  let attributes = new Map();
  let index = start;
  while (index < html.length) {
    while (index < html.length && (isSpace(html[index]) || html[index] === "/")) index += 1;
    if (index >= html.length || html[index] === ">") return { attributes, end: index + 1 };
    let nameStart = index;
    while (index < html.length && !isSpace(html[index]) && html[index] !== "=" && html[index] !== ">" && html[index] !== "/") index += 1;
    let name = html.slice(nameStart, index).toLowerCase();
    while (index < html.length && isSpace(html[index])) index += 1;
    let value = "";
    if (html[index] === "=") {
      index += 1;
      while (index < html.length && isSpace(html[index])) index += 1;
      let quote = html[index];
      if (quote === '"' || quote === "'") {
        let close = html.indexOf(quote, index + 1);
        if (close < 0) close = html.length;
        value = html.slice(index + 1, close);
        index = close + 1;
      } else {
        let valueStart = index;
        while (index < html.length && !isSpace(html[index]) && html[index] !== ">") index += 1;
        value = html.slice(valueStart, index);
      }
    }
    if (name && !attributes.has(name)) attributes.set(name, value);
  }
  return { attributes, end: html.length };
}

function* startTags(html) {
  let lower = html.toLowerCase();
  let index = 0;
  while (index < html.length) {
    let open = html.indexOf("<", index);
    if (open < 0) return;
    if (html.startsWith("<!--", open)) {
      let close = html.indexOf("-->", open + 4);
      index = close < 0 ? html.length : close + 3;
      continue;
    }
    let nameEnd = open + 1;
    while (nameEnd < html.length && /[a-z0-9-]/i.test(html[nameEnd])) nameEnd += 1;
    if (nameEnd === open + 1) {
      let close = html.indexOf(">", open + 1);
      index = close < 0 ? html.length : close + 1;
      continue;
    }
    let name = lower.slice(open + 1, nameEnd);
    let { attributes, end } = readAttributes(html, nameEnd);
    yield { name, attributes };
    index = end;
    if (name === "script" || name === "style") {
      let close = lower.indexOf(`</${name}`, index);
      index = close < 0 ? html.length : close;
    }
  }
}

function pageScripts(htmlPath) {
  let html = readFileSync(htmlPath, "utf8");
  let sources = new Set();
  for (let { name, attributes } of startTags(html)) {
    if (name === "script") {
      if ((attributes.get("type") ?? "").trim().toLowerCase() === "application/ld+json") continue;
      sources.add(attributes.get("src") || "inline");
    } else if (name === "link") {
      let rel = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
      if (rel.includes("modulepreload") && attributes.get("href")) sources.add(attributes.get("href"));
    }
  }
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
let liveBenchmarkMetaPath = join(siteDirectory, ".site-meta/live-benchmark.json");
let liveBenchmarkFile = existsSync(liveBenchmarkMetaPath)
  ? `/${JSON.parse(readFileSync(liveBenchmarkMetaPath, "utf8")).fileName.replace(/^\//, "")}`
  : "";
if (!liveBenchmarkFile) failures.push(".site-meta/live-benchmark.json is missing; run the site build");
let accelPage = join(distDirectory, "docs/accel/index.html");
for (let path of docsPages) {
  let sources = pageScripts(path);
  if (sources.includes("inline")) failures.push(`${relative(distDirectory, path)} ships inline JS`);
  let allowed = new Set(["/snippet-copy.js"]);
  if (path === accelPage && liveBenchmarkFile) allowed.add(liveBenchmarkFile);
  let unexpected = sources.filter((source) => !allowed.has(source));
  if (unexpected.length > 0) failures.push(`${relative(distDirectory, path)} ships unexpected JS: ${unexpected.join(", ")}`);
}
if (liveBenchmarkFile && existsSync(accelPage) && !pageScripts(accelPage).includes(liveBenchmarkFile)) {
  failures.push("/docs/accel/ is missing the live benchmark script");
}
let docsSharedScripts = [...new Set(docsPages.flatMap((path) => pageScripts(path).filter((source) => source === "/snippet-copy.js")))];
let docsJsBytes = docsSharedScripts.reduce((sum, source) => sum + gzipSize(join(distDirectory, source.replace(/^\//, ""))), 0);
measure(`unique shared docs JS (${docsSharedScripts.length || "none"} file) across ${docsPages.length} pages`, docsJsBytes, budgets.docsJs);
if (liveBenchmarkFile) {
  let liveBenchmarkPath = join(distDirectory, liveBenchmarkFile.replace(/^\//, ""));
  measure(`live benchmark JS (gzip)`, gzipSize(liveBenchmarkPath), budgets.liveBenchmarkJs);
  let liveBenchmarkSource = readFileSync(liveBenchmarkPath, "utf8");
  if (liveBenchmarkSource.includes("node:fs") || liveBenchmarkSource.includes("node:path") || liveBenchmarkSource.includes("node:url")) {
    failures.push("live benchmark bundle leaks a node: builtin");
  }
}

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
  report.push(`build-only deps (effect, marked, mermaid, playwright, shiki): 0 bytes in ${Object.keys(modules).length} chunk(s)`);
  let fireChunk = Object.keys(modules).find((chunk) => modules[chunk].some((id) => id.endsWith("/hero-fire-gl.ts")));
  if (!fireChunk) failures.push("the hero WebGL code is not in its own chunk");
  else {
    measure(`${fireChunk} lazy hero WebGL (gzip)`, gzipSize(join(distDirectory, fireChunk)), budgets.fireJs);
    if (pageScripts(join(distDirectory, "index.html")).some((source) => source.endsWith(fireChunk))) failures.push(`/ preloads ${fireChunk}`);
  }
}

console.log(report.join("\n"));
if (failures.length > 0) {
  console.error(failures.map((failure) => `budget: ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Budgets pass.");
