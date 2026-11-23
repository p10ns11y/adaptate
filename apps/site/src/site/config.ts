export let defaultSiteUrl = "https://preview.invalid";
export let repositoryUrl = "https://github.com/p10ns11y/adaptate";
export let siteName = "adaptate";
export let indexable = globalThis.process?.env?.SITE_INDEXABLE === "1";

export function resolveSiteUrl(value: string | undefined): string {
  let raw = value && value.length > 0 ? value : defaultSiteUrl;
  let url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error(`SITE_URL must be https, got ${raw}`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`SITE_URL must be an origin with no path, got ${raw}`);
  }
  return url.origin;
}

export function absoluteUrl(siteUrl: string, path: string): string {
  return new URL(path, `${siteUrl}/`).href;
}

export function slugFor(path: string): string {
  let trimmed = path.replace(/^\/+|\/+$/g, "");
  return trimmed.length === 0 ? "home" : trimmed.replaceAll("/", "-");
}
