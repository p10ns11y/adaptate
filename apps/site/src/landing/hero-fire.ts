export let fireImage = { width: 1280, height: 720 };

export let fireTokens = ["--flame-red", "--flame-ember", "--flame-orange", "--flame-amber", "--flame-yellow", "--flame-white", "--flame-blue", "--smoke"];

export type FireHost = {
  document: { readyState: DocumentReadyState };
  matchMedia(query: string): { matches: boolean };
  addEventListener(type: "load", listener: () => void, options: { once: true }): void;
  setTimeout(callback: () => void, delay: number): number;
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number;
};

export let firePeriod = 64;

export let fireFrameMs = 1000 / 30;

let fireRates = [7, 6, 0.05, 0.08, 0.03, 0.06, 3.2, 6.5];

export function firePhases(seconds: number): number[] {
  return [...fireRates.map((rate) => (seconds * rate) % firePeriod), (seconds * 13) % (2 * Math.PI)];
}

export type Fit ={ x: number; y: number; width: number; height: number };

export function firePixelRatio(devicePixelRatio: number, cssWidth: number, cssHeight: number): number {
  let ratio = Math.min(devicePixelRatio || 1, cssWidth < 700 ? 1 : 1.5);
  let pixels = cssWidth * cssHeight * ratio * ratio;
  let budget = cssWidth < 700 ? 400_000 : 1_100_000;
  return pixels > budget ? ratio * Math.sqrt(budget / pixels) : ratio;
}

export function objectPosition(value: string): [number, number] {
  let parts = value.split(/\s+/).map((part) => (part.endsWith("%") ? Number.parseFloat(part) / 100 : Number.NaN));
  let pick = (part: number | undefined) => (part === undefined || Number.isNaN(part) ? 0.5 : part);
  return [pick(parts[0]), pick(parts[1])];
}

export function coverFit(boxWidth: number, boxHeight: number, position: [number, number]): Fit {
  let scale = Math.max(boxWidth / fireImage.width, boxHeight / fireImage.height);
  let width = fireImage.width * scale;
  let height = fireImage.height * scale;
  return { x: (boxWidth - width) * position[0], y: (boxHeight - height) * position[1], width, height };
}

export function hexColor(value: string): [number, number, number] | null {
  let match = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (!match?.[1]) return null;
  let number = Number.parseInt(match[1], 16);
  return [(number >> 16) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
}

export function lightFireLater(start: () => void, host: FireHost = window): boolean {
  if (host.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  let idle = () => {
    if (host.requestIdleCallback) host.requestIdleCallback(start, { timeout: 2500 });
    else host.setTimeout(start, 800);
  };
  if (host.document.readyState === "complete") idle();
  else host.addEventListener("load", idle, { once: true });
  return true;
}
