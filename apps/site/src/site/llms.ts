import { absoluteUrl } from "./config.ts";
import { routeForDoc } from "./docs-model.ts";

export function rewriteLlms(text: string, siteUrl: string): string {
  return text
    .replace(
      "Paths are relative to the repository root. There is no deployed documentation site.",
      `Links point to the adaptate docs at ${siteUrl}/docs/.`,
    )
    .replace(/\]\((docs\/[\w./-]+\.md)\)/g, (_match, path: string) => `](${absoluteUrl(siteUrl, routeForDoc(path))})`)
    .replace(/^Source: (docs\/[\w./-]+\.md)$/gm, (_match, path: string) => `Source: ${absoluteUrl(siteUrl, routeForDoc(path))}`);
}
