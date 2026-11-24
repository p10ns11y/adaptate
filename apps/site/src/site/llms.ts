import { absoluteUrl } from "./config.ts";
import { rewriteHref } from "./docs-model.ts";

function linkFor(href: string, sourcePath: string, siteUrl: string): string {
  let rewritten = rewriteHref(href, sourcePath);
  return rewritten.startsWith("/") ? absoluteUrl(siteUrl, rewritten) : rewritten;
}

export function rewriteLlms(text: string, siteUrl: string): string {
  let sourcePath = "llms.txt";
  return text
    .replace(
      "Paths are relative to the repository root. There is no deployed documentation site.",
      `Docs: ${siteUrl}/docs/`,
    )
    .split("\n")
    .map((line) => {
      let source = line.match(/^Source: (\S+)$/);
      if (source?.[1]) {
        sourcePath = source[1];
        return `Source: ${linkFor(source[1].split("/").pop() ?? "", source[1], siteUrl)}`;
      }
      return line
        .replace(/\]\(([^)\s]+)\)/g, (_match, href: string) => `](${linkFor(href, sourcePath, siteUrl)})`)
        .replace(/\b(src|href)="([^"]+)"/g, (_match, name: string, href: string) => `${name}="${linkFor(href, sourcePath, siteUrl)}"`);
    })
    .join("\n");
}
