import { escapeHtml } from "./head.ts";
import type { SiteRoute } from "./routes.ts";

export type OgPalette = Record<string, { hex: string }>;

function color(palette: OgPalette, name: string): string {
  let token = palette[name];
  if (!token) throw new Error(`Missing palette token ${name}`);
  return token.hex;
}

export function renderOgHtml(route: SiteRoute, markSvg: string, palette: OgPalette): string {
  let voidColor = color(palette, "void");
  let cloud = color(palette, "cloud");
  let thrust = color(palette, "thrust");
  let exhaust = color(palette, "exhaust");
  let ocean = color(palette, "ocean");
  let label = route.kind === "api" ? "API reference" : route.kind === "guide" ? "Docs" : "adaptate";
  let answer = route.answer.length > 190 ? `${route.answer.slice(0, 187).replace(/\s+\S*$/, "")}…` : route.answer;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;background:${voidColor};color:${cloud};font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.frame{box-sizing:border-box;width:1200px;height:630px;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;border-bottom:10px solid ${thrust};border-top:2px solid ${ocean}}
.top{display:flex;align-items:center;gap:22px;font-size:40px;font-weight:650;letter-spacing:-0.5px}
.top svg{width:84px;height:84px}
.label{margin-left:auto;font-size:26px;color:${exhaust};font-weight:500}
h1{margin:0 0 22px;font-size:${route.heading.length > 48 ? 50 : 64}px;line-height:1.08;letter-spacing:-1.5px}
p{margin:0;font-size:29px;line-height:1.4;color:${cloud};opacity:.92;max-width:1000px}
</style></head><body><div class="frame"><div class="top">${markSvg}<span>adaptate</span><span class="label">${escapeHtml(label)}</span></div><div><h1>${escapeHtml(route.heading.replace(/[\\`]/g, ""))}</h1><p>${escapeHtml(answer)}</p></div></div></body></html>`;
}
