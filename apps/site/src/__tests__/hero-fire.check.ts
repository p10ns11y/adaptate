import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { coverFit, fireFrameMs, firePeriod, firePhases, firePixelRatio, fireTokens, hexColor, lightFireLater, objectPosition, type FireHost } from "../landing/hero-fire";

let siteRoot = new URL("../../", import.meta.url);
let read = (path: string) => readFileSync(new URL(path, siteRoot), "utf8");

function host(options: { reduced?: boolean; readyState?: DocumentReadyState; idle?: boolean } = {}) {
  let onLoad: Array<() => void> = [];
  let idle = vi.fn((callback: () => void, _options: { timeout: number }) => {
    callback();
    return 1;
  });
  let timeout = vi.fn((callback: () => void, _delay: number) => {
    callback();
    return 1;
  });
  let fake: FireHost = {
    document: { readyState: options.readyState ?? "complete" },
    matchMedia: () => ({ matches: options.reduced ?? false }),
    addEventListener: (_type, listener) => {
      onLoad.push(listener);
    },
    setTimeout: timeout,
    ...(options.idle === false ? {} : { requestIdleCallback: idle }),
  };
  return { fake, idle, timeout, load: () => onLoad.forEach((listener) => listener()) };
}

describe("hero fire wiring", () => {
  it("keeps the static hero under reduced motion", () => {
    let start = vi.fn();
    let { fake, idle } = host({ reduced: true });
    expect(lightFireLater(start, fake)).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(idle).not.toHaveBeenCalled();
  });

  it("waits for load, then for an idle slot", () => {
    let start = vi.fn();
    let { fake, idle, load } = host({ readyState: "interactive" });
    expect(lightFireLater(start, fake)).toBe(true);
    expect(start).not.toHaveBeenCalled();
    load();
    expect(idle).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
  });

  it("falls back to a timer without requestIdleCallback", () => {
    let start = vi.fn();
    let { fake, timeout } = host({ idle: false });
    lightFireLater(start, fake);
    expect(timeout).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
  });

  it("loads WebGL only through a dynamic import", () => {
    let main = read("src/landing/main.ts");
    expect(main).toContain('import("./hero-fire-gl.ts")');
    expect(main).not.toMatch(/^import .*hero-fire-gl/m);
    let gl = read("src/landing/hero-fire-gl.ts");
    expect(gl).toContain('setAttribute("aria-hidden", "true")');
    expect(gl).toContain("webglcontextlost");
    expect(gl).toContain("failIfMajorPerformanceCaveat: true");
    expect(gl).not.toMatch(/\bfetch\(|XMLHttpRequest|innerHTML|\beval\(/);
  });

  it("caps the pixel ratio and the pixel count", () => {
    expect(firePixelRatio(3, 1200, 675)).toBeLessThanOrEqual(1.5);
    expect(firePixelRatio(3, 390, 544)).toBeLessThanOrEqual(1);
    expect(firePixelRatio(1, 800, 450)).toBe(1);
    let ratio = firePixelRatio(2, 2000, 1125);
    expect(2000 * 1125 * ratio * ratio).toBeLessThanOrEqual(1_100_001);
  });

  it("keeps every phase small and steps it smoothly across the wrap", () => {
    for (let seconds of [0, 1.5, 600, 86_400 * 30]) {
      let phases = firePhases(seconds);
      expect(phases).toHaveLength(9);
      for (let [index, phase] of phases.entries()) {
        let period = index === 8 ? 2 * Math.PI : firePeriod;
        expect(phase).toBeGreaterThanOrEqual(0);
        expect(phase).toBeLessThan(period);
        let step = (firePhases(seconds + fireFrameMs / 1000)[index] ?? 0) - phase;
        let gap = Math.min(Math.abs(step), Math.abs(Math.abs(step) - period));
        expect(gap).toBeLessThan(0.5);
      }
    }
  });

  it("keeps the blur off the animated canvas", () => {
    let css = read("public/site.css");
    expect(css).not.toMatch(/canvas[^{]*\{[^}]*blur/);
    expect(read("src/landing/hero-fire-gl.ts")).toContain("fireFrameMs");
  });

  it("maps the image like object-fit cover", () => {
    expect(coverFit(1280, 720, [0.5, 0.5])).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
    let tall = coverFit(390, 544, objectPosition("57% 20%"));
    expect(tall.height).toBe(544);
    expect(tall.x).toBeCloseTo((390 - (1280 * 544) / 720) * 0.57);
    expect(objectPosition("left top")).toEqual([0.5, 0.5]);
  });

  it("reads every flame token from the stylesheet", () => {
    let css = read("public/site.css");
    for (let token of fireTokens) {
      let value = css.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6});`))?.[1] ?? "";
      expect(hexColor(value), token).not.toBeNull();
    }
    expect(hexColor("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(hexColor("red")).toBeNull();
  });

  it("hides the canvas and stills the arrow under reduced motion", () => {
    let reduced = read("public/site.css").match(/@media \(prefers-reduced-motion: reduce\) \{\n([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(reduced).toContain(".hero-art canvas { display: none; }");
    expect(reduced).toContain(".guide-card:hover i { transform: translateY(-50%); }");
  });
});
