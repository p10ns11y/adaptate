import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { contrastRatio, paletteSchema } from "../site/palette";

let siteRoot = new URL("../../", import.meta.url);
let repositoryRoot = new URL("../../../../", import.meta.url);
let read = (path: string, base = siteRoot) => readFileSync(new URL(path, base), "utf8");
let palette = paletteSchema.parse(JSON.parse(read("palette.json")));
let hex = (name: keyof typeof palette.tokens) => palette.tokens[name].hex;

describe("palette", () => {
  it("matches the recorded hexes", () => {
    expect(Object.fromEntries(Object.entries(palette.tokens).map(([name, token]) => [name, token.hex]))).toEqual({
      "plume-core": "#FFE99D",
      thrust: "#ECA43F",
      ember: "#B76625",
      void: "#0F0E0C",
      ocean: "#294C74",
      cloud: "#D3D4D6",
      sky: "#799AD5",
      exhaust: "#B59789",
    });
  });

  it("keeps the dark-theme text pairs at WCAG AA", () => {
    let body = [
      ["cloud", "void", 13.01],
      ["exhaust", "void", 7.12],
      ["sky", "void", 6.8],
      ["plume-core", "void", 15.98],
      ["thrust", "void", 9.14],
      ["ember", "void", 4.54],
      ["cloud", "ocean", 5.95],
    ] as const;
    for (let [foreground, background, recorded] of body) {
      let ratio = contrastRatio(hex(foreground), hex(background));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeCloseTo(recorded, 1);
    }
    expect(contrastRatio(hex("sky"), hex("ocean"))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(hex("exhaust"), hex("ocean"))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(hex("void"), hex("thrust"))).toBeGreaterThanOrEqual(4.5);
  });

  it("drives the theme CSS custom properties", () => {
    let css = read("public/site.css");
    for (let [name, token] of Object.entries(palette.tokens)) {
      expect(css).toContain(`--${name}: ${token.hex};`);
    }
  });

  it("uses only palette hexes in the logo files", () => {
    let allowed = new Set(Object.values(palette.tokens).map((token) => token.hex));
    let files = [
      read("public/favicon.svg"),
      read("public/mark.svg"),
      read("public/logo.svg"),
      read("assets/logo.svg", repositoryRoot),
      read("assets/logo-dark.svg", repositoryRoot),
    ];
    for (let file of files) {
      for (let match of file.matchAll(/#[0-9A-Fa-f]{6}\b/g)) expect(allowed).toContain(match[0].toUpperCase());
      expect(file).not.toMatch(/<text|font-family/);
    }
  });
});
