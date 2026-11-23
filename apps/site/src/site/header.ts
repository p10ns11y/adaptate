import { repositoryUrl } from "./config.ts";
import type { RouteKind } from "./routes.ts";

let links: Array<{ href: string; label: string; kinds: RouteKind[] }> = [
  { href: "/docs/", label: "Docs", kinds: ["guide"] },
  { href: "/docs/api/", label: "API", kinds: ["api"] },
  { href: "/docs/choke-points/", label: "Find your choke points", kinds: [] },
  { href: "/load/", label: "Load test", kinds: ["load"] },
];

export function renderHeader(kind: RouteKind): string {
  let items = links
    .map((link) => {
      let current = link.kinds.includes(kind) ? ` aria-current="page"` : "";
      return `<li><a href="${link.href}"${current}>${link.label}</a></li>`;
    })
    .join("");
  return [
    `<a class="skip" href="#main">Skip to content</a>`,
    `<header class="site-header"><div class="wrap bar">`,
    `<a class="brand" href="/"><img src="/logo.svg" alt="adaptate" width="274" height="48"></a>`,
    `<nav aria-label="Site"><ul>${items}<li><a href="${repositoryUrl}">GitHub</a></li></ul></nav>`,
    `</div></header>`,
  ].join("");
}

export function renderFooter(): string {
  return [
    `<footer class="site-footer"><div class="wrap">`,
    `<p>MIT. <a href="${repositoryUrl}">Source on GitHub</a> · <a href="/journey/">Journey</a> · <a href="${repositoryUrl}/blob/main/docs/credits.md">Credits</a> · <a href="/llms.txt">llms.txt</a></p>`,
    `</div></footer>`,
  ].join("");
}
