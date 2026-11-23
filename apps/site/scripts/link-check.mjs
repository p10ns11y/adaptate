import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

let distDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
let seeds = ["/", "/docs/", "/docs/api/", "/load/", "/llms.txt", "/llms-full.txt", "/sitemap.xml", "/robots.txt"];
let siteUrl = process.env.SITE_URL ?? "https://preview.invalid";

function fileFor(pathname) {
  let path = normalize(join(distDirectory, decodeURIComponent(pathname)));
  if (!path.startsWith(distDirectory)) return null;
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, "index.html");
  return existsSync(path) && statSync(path).isFile() ? path : null;
}

function internalPath(href, from) {
  if (/^(mailto|data|javascript):/i.test(href) || href.startsWith("#")) return null;
  let url = new URL(href, new URL(from, siteUrl));
  if (url.origin !== new URL(siteUrl).origin) return null;
  return url.pathname;
}

function linksIn(text, path) {
  if (path.endsWith(".html")) {
    return [...text.matchAll(/\s(?:href|src|content)="([^"]+)"/g)]
      .map((match) => match[1].replaceAll("&amp;", "&"))
      .filter((value) => /^(\/|\.|[a-z][\w+.-]*:\/\/|[\w-]+[/.])/i.test(value) && !/\s/.test(value));
  }
  if (path.endsWith(".xml")) return [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  return [...text.matchAll(/\]\(([^)\s]+)\)|(?:^|\s)((?:https?:\/\/)\S+)/gm)].map((match) => match[1] ?? match[2]);
}

let seen = new Set();
let queue = [...seeds];
let broken = [];
while (queue.length > 0) {
  let pathname = queue.shift();
  if (seen.has(pathname)) continue;
  seen.add(pathname);
  let file = fileFor(pathname);
  if (!file) {
    broken.push(pathname);
    continue;
  }
  if (!/\.(html|txt|xml)$/.test(file)) continue;
  let text = readFileSync(file, "utf8");
  for (let href of linksIn(text, file)) {
    let target = internalPath(href, pathname);
    if (target && !seen.has(target)) {
      queue.push(target);
      if (!fileFor(target)) broken.push(`${target} (from ${pathname})`);
    }
  }
}

let unique = [...new Set(broken)];
if (unique.length > 0) {
  console.error(`${unique.length} internal 404(s):\n${unique.join("\n")}`);
  process.exit(1);
}
console.log(`link-check: ${seen.size} internal URLs, 0 internal 404s.`);
