import { z } from "zod";

import { absoluteUrl, indexable, repositoryUrl, slugFor } from "./config.ts";
import type { SiteRoute } from "./routes.ts";

export type ExtractedPage = {
  lang: string;
  title: string;
  metas: Record<string, string>;
  canonical: string | null;
  jsonLd: string[];
  firstMainParagraph: string | null;
  scriptCount: number;
  scriptSrcs: string[];
  h1Count: number;
};

export function allowedDocsScript(path: string, src: string): boolean {
  if (src === "/snippet-copy.js") return true;
  return path === "/docs/accel/" && /^\/assets\/live-benchmark-[^/]+\.js$/.test(src);
}

export function extractPage(): ExtractedPage {
  let metas: Record<string, string> = {};
  for (let meta of Array.from(document.querySelectorAll("meta[name], meta[property]"))) {
    let key = meta.getAttribute("property") ?? meta.getAttribute("name") ?? "";
    metas[key] = meta.getAttribute("content") ?? "";
  }
  let scripts = Array.from(document.querySelectorAll("script"));
  return {
    lang: document.documentElement.lang,
    title: document.title,
    metas,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
    jsonLd: scripts.filter((script) => script.type === "application/ld+json").map((script) => script.textContent ?? ""),
    firstMainParagraph: document.querySelector("main p")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    scriptSrcs: scripts
      .filter((script) => script.type !== "application/ld+json")
      .map((script) => script.getAttribute("src") ?? "inline"),
    scriptCount: scripts.filter((script) => script.type !== "application/ld+json").length,
    h1Count: document.querySelectorAll("h1").length,
  };
}

let softwareSchema = z.object({
  "@context": z.literal("https://schema.org"),
  "@type": z.literal("SoftwareSourceCode"),
  name: z.string().min(1),
  description: z.string().min(1),
  url: z.url(),
  codeRepository: z.literal(repositoryUrl),
  programmingLanguage: z.literal("TypeScript"),
  license: z.url(),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
});

let faqSchema = z.object({
  "@context": z.literal("https://schema.org"),
  "@type": z.literal("FAQPage"),
  url: z.url(),
  mainEntity: z
    .array(
      z.object({
        "@type": z.literal("Question"),
        name: z.string().min(8),
        acceptedAnswer: z.object({ "@type": z.literal("Answer"), text: z.string().min(8) }),
      }),
    )
    .min(2),
});

let typedSchema = z.object({ "@type": z.enum(["SoftwareSourceCode", "FAQPage"]) });

function issuesOf(label: string, result: z.ZodSafeParseResult<unknown>): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => `${label} ${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

export function checkPage(page: ExtractedPage, route: SiteRoute, siteUrl: string): string[] {
  let issues: string[] = [];
  let url = absoluteUrl(siteUrl, route.path);
  let image = absoluteUrl(siteUrl, `/og/${slugFor(route.path)}.png`);
  let originPrefix = `${siteUrl}/`;
  let absoluteSite = z.url().refine((value) => value.startsWith(originPrefix), `must start with ${originPrefix}`);
  let headSchema = z.object({
    lang: z.literal("en"),
    title: z.string().min(10).max(60),
    canonical: absoluteSite.refine((value) => value === url, `must equal ${url}`),
    metas: z.object({
      description: z.string().min(50).max(160),
      robots: indexable ? z.string() : z.string().regex(/noindex/),
      "og:type": z.literal("website"),
      "og:title": z.literal(page.title),
      "og:description": z.string().min(50),
      "og:url": z.literal(url),
      "og:image": absoluteSite.refine((value) => value === image, `must equal ${image}`),
      "og:image:width": z.literal("1200"),
      "og:image:height": z.literal("630"),
      "og:image:alt": z.string().min(1),
      "twitter:card": z.literal("summary_large_image"),
      "twitter:title": z.string().min(1),
      "twitter:description": z.string().min(1),
      "twitter:image": z.literal(image),
    }),
    h1Count: z.literal(1),
  });
  issues.push(...issuesOf("head", headSchema.safeParse(page)));
  if (page.title !== route.title) issues.push(`title must equal the manifest title "${route.title}"`);
  if (page.metas.description !== route.description) issues.push("description must equal the manifest description");
  if (page.firstMainParagraph !== route.answer) issues.push("the first <p> in <main> must be the answer");
  for (let [key, value] of Object.entries(page.metas)) {
    if (/^https?:\/\//.test(value) && !value.startsWith(originPrefix)) issues.push(`${key} points outside SITE_URL`);
  }
  let parsed: unknown[] = [];
  for (let raw of page.jsonLd) {
    try {
      parsed.push(JSON.parse(raw));
    } catch {
      issues.push("JSON-LD is not valid JSON");
    }
  }
  for (let item of parsed) issues.push(...issuesOf("JSON-LD @type", typedSchema.safeParse(item)));
  let typed = (name: string) => parsed.filter((item) => typeof item === "object" && item !== null && (item as Record<string, unknown>)["@type"] === name);
  let software = typed("SoftwareSourceCode");
  if (software.length !== 1) issues.push("JSON-LD needs exactly one SoftwareSourceCode");
  for (let item of software) issues.push(...issuesOf("SoftwareSourceCode", softwareSchema.safeParse(item)));
  if (route.kind === "guide" || route.kind === "api") {
    let faq = typed("FAQPage");
    if (faq.length !== 1) issues.push("docs pages need exactly one FAQPage");
    for (let item of faq) issues.push(...issuesOf("FAQPage", faqSchema.safeParse(item)));
    let unexpectedDocsScripts = page.scriptSrcs.filter((src) => !allowedDocsScript(route.path, src));
    if (unexpectedDocsScripts.length > 0) {
      issues.push(`docs pages may only ship /snippet-copy.js, found ${page.scriptSrcs.join(", ") || "no script src"}`);
    }
  }
  return issues;
}
