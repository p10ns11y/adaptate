import {
  allSegments,
  defaultRun,
  pathFor,
  pointFor,
  railCode,
  railGeometry,
  railLegend,
  railRoute,
  railRunNames,
  railRuns,
  railSummary,
  runRail,
  type RailStop,
} from "../landing/rail-model.ts";
import { escapeHtml } from "./head.ts";

let { width, height, entryX, exitX, y, x } = railGeometry;

export function renderTraceLines(stops: RailStop[]): string {
  return stops
    .map(
      (stop) =>
        `<li data-track="${stop.track}"${stop.skipped ? " data-skipped" : ""}><code>${escapeHtml(stop.call)}</code><b>${stop.track}</b><span>${escapeHtml(stop.out)}</span></li>`,
    )
    .join("");
}

export function renderRailFigure(): string {
  let stops = runRail(defaultRun);
  let route = new Set(railRoute(stops).map((segment) => segment.key));
  let segments = allSegments();
  let switches = segments.filter((segment) => segment.points.length > 2);
  let track = (d: string) => `<path class="bed" d="${d}"/><path class="steel" d="${d}"/>`;
  let last = stops.at(-1);
  let [tokenX, tokenY] = last ? pointFor(last.step, last.track) : [entryX, y.ok];
  let stations = (Object.keys(x) as Array<keyof typeof x>)
    .map(
      (step) =>
        `<g class="station"><circle cx="${x[step]}" cy="${y.ok}" r="7"/>${step === "recover" ? "" : `<circle class="low" cx="${x[step]}" cy="${y.err}" r="5"/>`}<text x="${x[step]}" y="${y.ok - 26}">${step}</text></g>`,
    )
    .join("");
  let lit = segments
    .map((segment) => `<path data-seg="${segment.key}" pathLength="1" d="${pathFor(segment.points)}"${route.has(segment.key) ? " data-lit" : ""}/>`)
    .join("");
  let legend = railLegend.map((item) => `<li><code>${item.step}</code> ${escapeHtml(item.text)}</li>`).join("");
  return [
    `<figure class="rail" data-track="${last?.track ?? "ok"}">`,
    `<svg class="rail-map" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">`,
    `<text class="tl" x="6" y="${y.ok + 5}">ok</text><text class="tl err" x="6" y="${y.err + 5}">err</text>`,
    `<g class="tracks">${track(`M${entryX} ${y.ok} L${exitX} ${y.ok}`)}${track(`M${x.parse - 30} ${y.err} L${x.recover - 20} ${y.err}`)}${switches.map((segment) => track(pathFor(segment.points))).join("")}</g>`,
    `<g class="lit">${lit}</g>`,
    stations,
    `<circle class="token" r="9" transform="translate(${tokenX} ${tokenY})"/>`,
    `</svg>`,
    `<figcaption><ol class="rail-legend">${legend}</ol></figcaption>`,
    `</figure>`,
  ].join("");
}

export function renderRailConsole(): string {
  let stops = runRail(defaultRun);
  let chips = railRunNames
    .map((name) => `<button type="button" class="chip" data-run="${name}" aria-pressed="${name === defaultRun}">${escapeHtml(railRuns[name].label)}</button>`)
    .join("");
  return [
    `<div class="console rail-console"><div class="console-in">`,
    `<div class="console-bar"><span class="console-id"><i aria-hidden="true"></i>Result · live</span>`,
    `<div class="chips seg" role="group" aria-label="Input">${chips}</div></div>`,
    `<figure class="rail-chain"><figcaption class="sr-only">The chain</figcaption><pre class="rail-code" tabindex="0"><code>${escapeHtml(`import { parse } from "@adaptate/core/result";\n\n${railCode};`)}</code></pre></figure>`,
    renderRailFigure(),
    `<ol id="rail-trace" class="rail-trace" aria-label="Trace">${renderTraceLines(stops)}</ol>`,
    `<p id="rail-status" class="rail-status" role="status">${escapeHtml(railSummary(defaultRun, stops))}</p>`,
    `</div></div>`,
  ].join("");
}
