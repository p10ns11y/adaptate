import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { Marked } from "marked";
import { chromium } from "playwright";

import { repositoryUrl, resolveSiteUrl } from "../src/site/config.ts";
import {
  apiRoute,
  groupNav,
  guideRoute,
  plainText,
  railDocs,
  rewriteHref,
  routeForDoc,
  slugifyHeading,
  sourceOnlyDocs,
} from "../src/site/docs-model.ts";
import { apiFrontMatterSchema, guideFrontMatterSchema, sourceOnlyFrontMatterSchema } from "../src/site/frontmatter.ts";
import { escapeHtml, renderHead } from "../src/site/head.ts";
import { renderFooter, renderHeader } from "../src/site/header.ts";
import { createSnippetHighlighter, withSnippetCopy } from "../src/site/highlight.ts";
import { renderRailFigure } from "../src/site/rail.ts";
import { renderLiveBenchmark } from "../src/site/live-benchmark.ts";
import { journeyRoute, staticRoutes } from "../src/site/routes.ts";

let require = createRequire(import.meta.url);
let siteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let repositoryRoot = resolve(siteDirectory, "../..");
let distDirectory = join(siteDirectory, "dist");
let metaDirectory = join(siteDirectory, ".site-meta");
let siteUrl = resolveSiteUrl(process.env.SITE_URL);
let version = JSON.parse(readFileSync(join(repositoryRoot, "packages/core/package.json"), "utf8")).version;
let palette = JSON.parse(readFileSync(join(siteDirectory, "palette.json"), "utf8")).tokens;

let highlight = await createSnippetHighlighter();

function walk(directory) {
  let files = [];
  for (let entry of readdirSync(directory, { withFileTypes: true })) {
    let path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.name.endsWith(".md")) files.push(path);
  }
  return files;
}

function splitFrontMatter(markdown, sourcePath) {
  let match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error(`${sourcePath} has no front matter`);
  return { data: loadYaml(match[1]), body: markdown.slice(match[0].length) };
}

function parseOrThrow(schema, value, sourcePath) {
  let result = schema.safeParse(value);
  if (!result.success) {
    let issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`${sourcePath} front matter: ${issues}`);
  }
  return result.data;
}

let docsDirectory = join(repositoryRoot, "docs");
let sources = walk(docsDirectory)
  .map((path) => relative(repositoryRoot, path).replaceAll("\\", "/"))
  .sort();

let pages = [];
for (let sourcePath of sources) {
  let markdown = readFileSync(join(repositoryRoot, sourcePath), "utf8");
  let { data, body } = splitFrontMatter(markdown, sourcePath);
  if (sourceOnlyDocs.has(sourcePath)) {
    parseOrThrow(sourceOnlyFrontMatterSchema, data, sourcePath);
    continue;
  }
  if (sourcePath.startsWith("docs/api/")) {
    let frontMatter = parseOrThrow(apiFrontMatterSchema, data, sourcePath);
    let exportNames = [...body.matchAll(/^- \[([\w$-]+)\]\(/gm)].map((match) => match[1]);
    let route = apiRoute({ sourcePath, title: frontMatter.title, description: frontMatter.description, exportNames });
    pages.push({ sourcePath, route, body });
  } else {
    let frontMatter = parseOrThrow(guideFrontMatterSchema, data, sourcePath);
    pages.push({ sourcePath, route: guideRoute(sourcePath, frontMatter), body });
  }
}

let indexMarkdown = readFileSync(join(docsDirectory, "index.md"), "utf8");
let guideNav = [...indexMarkdown.matchAll(/^- \[([^\]]+)\]\(([\w.-]+\.md)\)/gm)]
  .map((match) => ({ label: match[1], path: routeForDoc(`docs/${match[2]}`) }))
  .filter((item) => !item.path.startsWith("/docs/api/"));
let apiNav = pages
  .filter((page) => page.sourcePath.startsWith("docs/api/") && /\/(index\.md|[\w-]+\/index\.md)$/.test(page.sourcePath))
  .filter((page) => page.sourcePath.split("/").length <= 5)
  .map((page) => ({ label: page.route.heading === "API" ? "Overview" : page.route.heading, path: page.route.path }))
  .sort((left, right) => left.path.localeCompare(right.path));

let assetPrefix = `${repositoryUrl}/blob/main/`;
function localAsset(href) {
  if (!href.startsWith(assetPrefix) || !/\.(svg|png)$/.test(href)) return href;
  let path = href.slice(assetPrefix.length);
  mkdirSync(dirname(join(distDirectory, path)), { recursive: true });
  copyFileSync(join(repositoryRoot, path), join(distDirectory, path));
  return `/${path}`;
}

let diagrams = [];
let currentSource = "";
let marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      let html = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugifyHeading(html)}">${html}</h${depth}>\n`;
    },
    code({ text, lang }) {
      if (lang === "mermaid") {
        let index = diagrams.push({ source: text, svg: "" }) - 1;
        return `<!--diagram:${index}-->`;
      }
      return `${highlight.render(text, lang)}\n`;
    },
    html({ text }) {
      if (/^\s*<!--[\s\S]*-->\s*$/.test(text)) return "";
      return text.replace(/\b(src|href)="([^"]+)"/g, (_match, name, href) => `${name}="${localAsset(rewriteHref(href, currentSource))}"`);
    },
  },
});

function shortestSnippet(tokens) {
  let candidates = tokens.filter((token) => token.type === "code" && /^(ts|tsx|js|jsx)$/.test(token.lang ?? ""));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, token) => (token.text.length < best.text.length ? token : best));
}

let navGroups = [...groupNav([{ label: "Overview", path: "/docs/" }, ...guideNav]), { title: "API", links: apiNav }];

function renderNav(currentPath) {
  let item = (link) => {
    let current = link.path === currentPath ? ` aria-current="page"` : "";
    return `<li><a href="${link.path}"${current}>${escapeHtml(link.label)}</a></li>`;
  };
  return [
    `<nav aria-label="Docs">`,
    ...navGroups.map((group) => `<h2>${escapeHtml(group.title)}</h2><ul>${group.links.map(item).join("")}</ul>`),
    `</nav>`,
  ].join("");
}

let railExample = readFileSync(join(siteDirectory, "src/usages/result-rail.ts"), "utf8").trimEnd();
let railLead = [
  `<div class="rail-doc">${renderRailFigure()}</div>`,
  highlight.render(railExample, "ts"),
].join("\n");

function renderFaq(route) {
  let entries = route.faq
    .map((entry) => `<dt>${escapeHtml(entry.question)}</dt><dd>${escapeHtml(entry.answer)}</dd>`)
    .join("");
  return `<section class="faq" aria-labelledby="faq"><h2 id="faq">FAQ</h2><dl>${entries}</dl></section>`;
}

for (let page of pages) {
  currentSource = page.sourcePath;
  let tokens = marked.lexer(page.body);
  void marked.walkTokens(tokens, (token) => {
    if (token.type === "link") token.href = rewriteHref(token.href, currentSource);
    if (token.type === "image") token.href = localAsset(rewriteHref(token.href, currentSource));
  });
  let headingIndex = tokens.findIndex((token) => token.type === "heading" && token.depth === 1);
  if (headingIndex >= 0) tokens.splice(headingIndex, 1);
  let rail = railDocs.has(page.sourcePath);
  for (let index = tokens.length - 1; rail && index >= 0; index -= 1) {
    if (tokens[index].type === "code" && tokens[index].lang === "mermaid") tokens.splice(index, 1);
  }
  let snippet = rail ? null : shortestSnippet(tokens);
  let lead = rail ? railLead : "";
  if (snippet) {
    tokens.splice(tokens.indexOf(snippet), 1);
    lead = marked.parser([snippet]);
  }
  page.html = [
    `<h1>${escapeHtml(plainText(page.route.heading))}</h1>`,
    `<p class="answer">${escapeHtml(page.route.answer)}</p>`,
    lead,
    marked.parser(tokens),
    page.sourcePath === "docs/accel.md" ? renderLiveBenchmark() : "",
    renderFaq(page.route),
  ].join("\n");
}

let journeyMarkdown = readFileSync(join(repositoryRoot, "JOURNEY.md"), "utf8");
let journeyLead = journeyMarkdown
  .split(/\n\n+/)
  .map((part) => part.trim())
  .find((part) => part.length > 0 && !part.startsWith("#") && !part.startsWith("```"));
if ((journeyLead ?? "").replace(/\s+/g, " ") !== journeyRoute.answer) {
  throw new Error("JOURNEY.md lead paragraph must match journeyRoute.answer");
}
currentSource = "JOURNEY.md";
let journeyTokens = marked.lexer(journeyMarkdown);
let journeyHeadingIndex = journeyTokens.findIndex((token) => token.type === "heading" && token.depth === 1);
if (journeyHeadingIndex >= 0) journeyTokens.splice(journeyHeadingIndex, 1);
let journeyLeadIndex = journeyTokens.findIndex((token) => token.type === "paragraph");
if (journeyLeadIndex >= 0) journeyTokens.splice(journeyLeadIndex, 1);
let journeyHtml = [
  `<h1>${escapeHtml(plainText(journeyRoute.heading))}</h1>`,
  `<p class="answer">${escapeHtml(journeyRoute.answer)}</p>`,
  marked.parser(journeyTokens),
].join("\n");

function diagramLabel(source) {
  let title = source.match(/^\s*title\s+(.+)$/m);
  if (title) return `Timeline: ${title[1].trim()}`;
  let labels = [...source.matchAll(/\["([^"]+)"\]|\[([^\]"]+)\]/g)].map((match) => match[1] ?? match[2]);
  let unique = [...new Set(labels)].slice(0, 12);
  return `Flowchart: ${unique.join(", ")}`;
}

if (diagrams.length > 0) {
  let browser = await chromium.launch();
  try {
    let tab = await browser.newPage();
    await tab.setContent("<!doctype html><html><body></body></html>");
    await tab.addScriptTag({ path: require.resolve("mermaid/dist/mermaid.min.js") });
    let themeVariables = {
      background: palette.void.hex,
      primaryColor: "#16273A",
      primaryTextColor: palette.cloud.hex,
      primaryBorderColor: palette.sky.hex,
      lineColor: palette.exhaust.hex,
      secondaryColor: palette.ocean.hex,
      tertiaryColor: palette.void.hex,
      textColor: palette.cloud.hex,
      edgeLabelBackground: palette.void.hex,
      clusterBkg: "#16273A",
      clusterBorder: palette.ocean.hex,
      fontFamily: "ui-sans-serif, system-ui, sans-serif",
    };
    let rendered = await tab.evaluate(
      async ({ sources, themeVariables }) => {
        let mermaid = globalThis.mermaid;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables,
          securityLevel: "strict",
          htmlLabels: false,
          flowchart: { htmlLabels: false },
        });
        let output = [];
        for (let index = 0; index < sources.length; index += 1) {
          let { svg } = await mermaid.render(`diagram-${index}`, sources[index]);
          output.push(svg);
        }
        return output;
      },
      { sources: diagrams.map((diagram) => diagram.source), themeVariables },
    );
    rendered.forEach((svg, index) => {
      diagrams[index].svg = svg;
    });
  } finally {
    await browser.close();
  }
}

function withDiagrams(html) {
  return html.replace(/<!--diagram:(\d+)-->/g, (_match, index) => {
    let diagram = diagrams[Number(index)];
    let svg = diagram.svg.replace(/<svg /, `<svg role="img" aria-label="${escapeHtml(diagramLabel(diagram.source))}" `);
    return `<figure class="diagram">${svg}</figure>\n`;
  });
}

let liveBenchmarkMeta = JSON.parse(readFileSync(join(metaDirectory, "live-benchmark.json"), "utf8"));
let liveBenchmarkSrc = `/${liveBenchmarkMeta.fileName.replace(/^\//, "")}`;
let liveBenchmarkScript = `<script type="module" src="${liveBenchmarkSrc}"></script>`;

for (let page of pages) {
  let document = [
    "<!doctype html>",
    `<html lang="en">`,
    "  <head>",
    `    ${renderHead(page.route, { siteUrl, version })}`,
    "  </head>",
    "  <body>",
    `    ${renderHeader(page.route.kind)}`,
    `    <main id="main" tabindex="-1"><div class="wrap docs">${renderNav(page.route.path)}<article>`,
    withDiagrams(page.html),
    "</article></div></main>",
    `    ${withSnippetCopy(page.html)}`,
    page.sourcePath === "docs/accel.md" ? liveBenchmarkScript : "",
    `    ${renderFooter()}`,
    "  </body>",
    "</html>",
    "",
  ].join("\n");
  let outputPath = join(distDirectory, page.route.path, "index.html");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, document);
}

let journeyDocument = [
  "<!doctype html>",
  `<html lang="en">`,
  "  <head>",
  `    ${renderHead(journeyRoute, { siteUrl, version })}`,
  "  </head>",
  "  <body>",
  `    ${renderHeader(journeyRoute.kind)}`,
  `    <main id="main" tabindex="-1"><div class="wrap journey"><article>`,
  withDiagrams(journeyHtml),
  "</article></div></main>",
  `    ${withSnippetCopy(journeyHtml)}`,
  `    ${renderFooter()}`,
  "  </body>",
  "</html>",
  "",
].join("\n");
mkdirSync(join(distDirectory, "journey"), { recursive: true });
writeFileSync(join(distDirectory, "journey", "index.html"), journeyDocument);

let routes = [...staticRoutes, journeyRoute, ...pages.map((page) => page.route)];
let seen = new Set();
for (let route of routes) {
  if (seen.has(route.path)) throw new Error(`Duplicate route ${route.path}`);
  seen.add(route.path);
}
mkdirSync(metaDirectory, { recursive: true });
writeFileSync(join(metaDirectory, "routes.json"), `${JSON.stringify(routes, null, 2)}\n`);
console.log(`Wrote ${pages.length} docs pages, /journey, and ${diagrams.length} diagrams.`);
