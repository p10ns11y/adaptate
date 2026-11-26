import { repositoryUrl } from "./config.ts";
import { descriptionFrom, type FaqEntry, type SiteRoute } from "./routes.ts";

export let sourceOnlyDocs = new Set(["docs/credits.md", "docs/inspiration.md"]);

export let railDocs = new Set(["docs/choke-points.md", "docs/api/core/result/index.md"]);

export type NavLink = { label: string; path: string };

let navGroups = [
  { title: "Start", paths: ["/docs/", "/docs/choke-points/", "/docs/transform/", "/docs/openapi/", "/docs/zod/"] },
  { title: "Streams", paths: ["/docs/streaming/", "/docs/v3/", "/docs/ag-ui/", "/docs/web-streams/", "/docs/effect/"] },
  { title: "Advanced", paths: ["/docs/accel/", "/docs/verification/"] },
  { title: "Reference", paths: ["/docs/typescript/", "/docs/subpaths/", "/docs/optional-peers/", "/docs/migration-2-4/", "/docs/migration-3-0/", "/docs/development/"] },
];

export function groupNav(links: NavLink[]): Array<{ title: string; links: NavLink[] }> {
  let byPath = new Map(links.map((link) => [link.path, link]));
  let placed = new Set(navGroups.flatMap((group) => group.paths));
  let groups = navGroups.map((group) => ({ title: group.title, links: group.paths.flatMap((path) => byPath.get(path) ?? []) }));
  groups.at(-1)?.links.push(...links.filter((link) => !placed.has(link.path)));
  return groups.filter((group) => group.links.length > 0);
}

export function routeForDoc(sourcePath: string): string {
  let inner = sourcePath.replace(/^docs\//, "").replace(/\.md$/, "");
  if (inner === "index") return "/docs/";
  if (inner.endsWith("/index")) inner = inner.slice(0, -"/index".length);
  return `/docs/${inner.replaceAll(".", "-")}/`;
}

function normalize(path: string): string {
  let parts: string[] = [];
  for (let segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

export function rewriteHref(href: string, sourcePath: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return href;
  let hashIndex = href.indexOf("#");
  let target = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  let hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  let base = sourcePath.split("/").slice(0, -1).join("/");
  let resolved = normalize(`${base}/${target}`);
  if (resolved === "llms.txt" || resolved === "llms-full.txt") return `/${resolved}`;
  if (resolved === "JOURNEY.md") return "/journey/";
  if (resolved.startsWith("docs/") && resolved.endsWith(".md") && !sourceOnlyDocs.has(resolved)) {
    return `${routeForDoc(resolved)}${hash}`;
  }
  let kind = /\.[a-z0-9]+$/i.test(resolved) ? "blob" : "tree";
  return `${repositoryUrl}/${kind}/main/${resolved}${hash}`;
}

function withoutTags(html: string): string {
  let text = "";
  let index = 0;
  while (index < html.length) {
    let close = html[index] === "<" ? html.indexOf(">", index + 1) : -1;
    if (close > index + 1) {
      index = close + 1;
      continue;
    }
    text += html[index];
    index += 1;
  }
  return text;
}

function withoutNamedEntities(html: string): string {
  let text = "";
  let index = 0;
  while (index < html.length) {
    if (html[index] === "&") {
      let end = index + 1;
      while (end < html.length && /[a-z]/i.test(html[end] ?? "")) end += 1;
      if (end > index + 1 && html[end] === ";") {
        index = end + 1;
        continue;
      }
    }
    text += html[index];
    index += 1;
  }
  return text;
}

export function slugifyHeading(text: string): string {
  return withoutNamedEntities(withoutTags(text.toLowerCase()))
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/\\([<>*_`[\]()])/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function pageTitle(heading: string, suffix: string): string {
  let full = `${heading} · ${suffix}`;
  if (full.length <= 60) return full;
  return heading.length <= 60 ? heading : `${heading.slice(0, 59)}…`;
}

let kindLabels: Record<string, string> = {
  Function: "function",
  "Type Alias": "type",
  Interface: "interface",
  Class: "class",
  Variable: "constant",
};

export function specifierFor(sourcePath: string): string {
  let parts = sourcePath.replace(/^docs\/api\//, "").split("/");
  let packageName = `@adaptate/${parts[0]}`;
  let entry = parts[1]?.replace(/\.md$/, "");
  if (!entry || entry === "index") return packageName;
  return `${packageName}/${entry}`;
}

export type ApiPageInput = {
  sourcePath: string;
  title: string;
  description: string;
  exportNames: string[];
};

function firstSentence(text: string): string {
  let match = text.match(/^(.+?[.!?])(\s|$)/);
  return (match ? match[1] : text).trim();
}

export function apiRoute(input: ApiPageInput): SiteRoute {
  let path = routeForDoc(input.sourcePath);
  let title = plainText(input.title);
  let titleMatch = title.match(/^(Function|Type Alias|Interface|Class|Variable): ([\w$]+)/);
  let written = plainText(input.description);
  let documented = written.length > 0 && !written.startsWith("Exported from ") && !written.startsWith("API reference");
  let specifier = specifierFor(input.sourcePath);
  if (input.sourcePath === "docs/api/index.md") {
    let answer =
      "The adaptate API reference is generated from the .d.ts files that ship in @adaptate/core and @adaptate/utils, with one page per export and one page per entry point.";
    return {
      path,
      kind: "api",
      title: pageTitle("API reference", "adaptate"),
      heading: "API",
      description: descriptionFrom(answer),
      answer,
      faq: [
        { question: "How is the API reference generated?", answer: "pnpm docs:api runs TypeDoc on the built .d.ts files and writes docs/api." },
        { question: "Which packages does it cover?", answer: "@adaptate/core with its seven entry points, and @adaptate/utils with its OpenAPI entry." },
      ],
    };
  }
  if (titleMatch) {
    let kind = kindLabels[titleMatch[1] ?? ""] ?? "export";
    let name = titleMatch[2] ?? title;
    let lead = documented ? `${name}: ${firstSentence(written)}` : `${name} is a ${kind} exported from ${specifier}.`;
    let answer = documented ? `${lead} Import it from ${specifier}.` : `${lead} Import it with import { ${name} } from "${specifier}".`;
    let faq: FaqEntry[] = [
      { question: `What does ${name} do?`, answer: documented ? firstSentence(written) : `${name} is a ${kind} in the adaptate API. The signature and parameters are on this page.` },
      { question: `Which subpath exports ${name}?`, answer: `${specifier} exports ${name}.` },
    ];
    return {
      path,
      kind: "api",
      title: pageTitle(name, "adaptate API"),
      heading: title,
      description: descriptionFrom(answer),
      answer,
      faq,
    };
  }
  let packageOverview = /^docs\/api\/[\w-]+\/index\.md$/.test(input.sourcePath);
  if (packageOverview) {
    let entries = input.exportNames.map((name) => (name === "index" ? specifier : `${specifier}/${name}`));
    let answer = `${specifier} publishes ${entries.length} entry point${entries.length === 1 ? "" : "s"}: ${entries.join(", ")}. Each entry point has its own page.`;
    return {
      path,
      kind: "api",
      title: pageTitle(`${specifier} entry points`, "adaptate API"),
      heading: `${specifier} entry points`,
      description: descriptionFrom(answer),
      answer,
      faq: [
        { question: `Which entry points does ${specifier} publish?`, answer: `${entries.join(", ")}.` },
        { question: "Are the types included?", answer: `Yes. Each entry point of ${specifier} ships its own .d.ts file.` },
      ],
    };
  }
  let listed = input.exportNames.slice(0, 8).join(", ");
  let more = input.exportNames.length > 8 ? ", and more" : "";
  let answer = `${specifier} is an adaptate entry point. It exports ${listed || "the items listed below"}${more}.`;
  if (answer.length > 300) answer = `${specifier} is an adaptate entry point. Its exports are listed below.`;
  return {
    path,
    kind: "api",
    title: pageTitle(specifier, "adaptate API"),
    heading: specifier,
    description: descriptionFrom(answer),
    answer,
    faq: [
      { question: `What does ${specifier} export?`, answer: `${listed || "The items listed on this page"}${more}.` },
      { question: `How do I import from ${specifier}?`, answer: `Use a named import, for example import { ${input.exportNames[0] ?? "name"} } from "${specifier}".` },
    ],
  };
}

export function guideRoute(
  sourcePath: string,
  frontMatter: { title: string; answer: string; faq: FaqEntry[] },
): SiteRoute {
  let heading = frontMatter.title;
  return {
    path: routeForDoc(sourcePath),
    kind: "guide",
    title: sourcePath === "docs/index.md" ? "adaptate docs: views, streams, OpenAPI" : pageTitle(heading, "adaptate docs"),
    heading: sourcePath === "docs/index.md" ? "Docs" : heading,
    description: descriptionFrom(frontMatter.answer),
    answer: frontMatter.answer,
    faq: frontMatter.faq,
  };
}
