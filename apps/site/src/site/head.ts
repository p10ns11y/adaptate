import { absoluteUrl, indexable, repositoryUrl, siteName, slugFor } from "./config.ts";
import { heroPreload } from "./media.ts";
import type { SiteRoute } from "./routes.ts";

export type HeadContext = {
  siteUrl: string;
  version: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function jsonLdScript(value: unknown): string {
  let json = JSON.stringify(value).replaceAll("<", "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

export function ogImagePath(route: SiteRoute): string {
  return `/og/${slugFor(route.path)}.png`;
}

export function structuredData(route: SiteRoute, context: HeadContext): unknown[] {
  let url = absoluteUrl(context.siteUrl, route.path);
  let items: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: siteName,
      description: route.description,
      url,
      codeRepository: repositoryUrl,
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js, browsers",
      license: "https://opensource.org/licenses/MIT",
      version: context.version,
    },
  ];
  if (route.kind === "guide" || route.kind === "api") {
    items.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      url,
      mainEntity: route.faq.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: entry.answer },
      })),
    });
  }
  return items;
}

export function renderHead(route: SiteRoute, context: HeadContext): string {
  let url = absoluteUrl(context.siteUrl, route.path);
  let image = absoluteUrl(context.siteUrl, ogImagePath(route));
  let title = escapeHtml(route.title);
  let description = escapeHtml(route.description);
  let robots = indexable ? "index, follow" : "noindex, nofollow";
  let lines = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta name="color-scheme" content="dark">`,
    `<meta name="theme-color" content="#0A0D12">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="stylesheet" href="/site.css">`,
    ...(route.kind === "landing" ? [heroPreload()] : []),
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${siteName}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${title}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
    ...structuredData(route, context).map(jsonLdScript),
  ];
  return lines.join("\n    ");
}
