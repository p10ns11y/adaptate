let widths = [640, 1280] as const;

export let heroImage = { name: "launch-hero", sizes: "100vw" };

let srcset = (name: string, type: "avif" | "webp") => widths.map((width) => `/media/${name}-${width}.${type} ${width}w`).join(", ");

export function heroPreload(): string {
  return `<link rel="preload" as="image" type="image/avif" imagesrcset="${srcset(heroImage.name, "avif")}" imagesizes="${heroImage.sizes}" fetchpriority="high">`;
}

export function renderArt(name: string, className: string, sizes: string, hero = false): string {
  let loading = hero ? `fetchpriority="high"` : `loading="lazy"`;
  return [
    `<div class="art ${className}" aria-hidden="true"><picture>`,
    `<source type="image/avif" srcset="${srcset(name, "avif")}" sizes="${sizes}">`,
    `<source type="image/webp" srcset="${srcset(name, "webp")}" sizes="${sizes}">`,
    `<img src="/media/${name}-1280.webp" alt="" width="1280" height="720" ${loading} decoding="async">`,
    `</picture></div>`,
  ].join("");
}

export let renderHeroArt = () => renderArt(heroImage.name, "hero-art", heroImage.sizes, true);
export let renderTrailArt = () => renderArt("thrust-trail", "trail-art", "(min-width: 1024px) 70vw, 100vw");
export let renderPadArt = () => renderArt("launch-pad", "pad-art", "100vw");
