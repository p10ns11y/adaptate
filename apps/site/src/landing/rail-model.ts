import { parse, type Result } from "@adaptate/core/result";

import { hold, order, price, reserve } from "../usages/result-rail.ts";

export type Track = "ok" | "err";
export type RailStep = "parse" | "map" | "flatMap" | "recover";
export type RailRun = "stocked" | "soldOut" | "badInput";
export type Point = readonly [number, number];

export type RailStop = {
  step: RailStep;
  call: string;
  track: Track;
  out: string;
  skipped: boolean;
};

export type RailSegment = { key: string; points: Point[] };

export let railRuns: Record<RailRun, { label: string; input: unknown }> = {
  stocked: { label: "In stock", input: { sku: "tea-01", qty: 2 } },
  soldOut: { label: "Sold out", input: { sku: "mug-02", qty: 1 } },
  badInput: { label: "Bad input", input: { sku: "tea-01", qty: "two" } },
};

export let railRunNames = Object.keys(railRuns) as RailRun[];
export let defaultRun: RailRun = "soldOut";

export let railCode = ["parse(order, input)", "  .map(price)", "  .flatMap(reserve)", "  .recover(hold)"].join("\n");

export let railLegend: Array<{ step: RailStep; text: string }> = [
  { step: "parse", text: "checks the input. ok holds the typed value, err holds the issues." },
  { step: "map", text: "runs on ok only. An error rides past it." },
  { step: "flatMap", text: "can fail, which switches to the err track." },
  { step: "recover", text: "turns an error back into an ok value." },
];

let show = (value: unknown) => JSON.stringify(value);

let outOf = (result: Result<unknown, unknown>) => (result.ok ? show(result.value) : show(result.error));

export function runRail(name: RailRun): RailStop[] {
  let input = railRuns[name].input;
  let parsed = parse(order, input);
  let priced = parsed.map(price);
  let reserved = priced.flatMap(reserve);
  let landed = reserved.recover(hold);
  let parsedOut = parsed.ok ? show(parsed.value) : `issues at ${hold(parsed.error).hold.replace(/^check /, "")}`;
  return [
    { step: "parse", call: `parse(order, ${show(input)})`, track: parsed.ok ? "ok" : "err", out: parsedOut, skipped: false },
    { step: "map", call: ".map(price)", track: priced.ok ? "ok" : "err", out: parsed.ok ? outOf(priced) : "skipped", skipped: !parsed.ok },
    { step: "flatMap", call: ".flatMap(reserve)", track: reserved.ok ? "ok" : "err", out: priced.ok ? outOf(reserved) : "skipped", skipped: !priced.ok },
    { step: "recover", call: ".recover(hold)", track: "ok", out: outOf(landed), skipped: reserved.ok },
  ];
}

export function railSummary(name: RailRun, stops: RailStop[]): string {
  let switched = stops.find((stop) => stop.track === "err");
  let last = stops.at(-1)?.out ?? "";
  if (!switched) return `${railRuns[name].label}: stayed on ok. Result ${last}.`;
  let turn = switched.step === "parse" ? "parse returned err" : `${switched.step} switched to err`;
  return `${railRuns[name].label}: ${turn}, recover brought it back. Result ${last}.`;
}

export let railGeometry = {
  width: 720,
  height: 176,
  entryX: 52,
  exitX: 704,
  y: { ok: 64, err: 136 } satisfies Record<Track, number>,
  x: { parse: 150, map: 330, flatMap: 500, recover: 640 } satisfies Record<RailStep, number>,
  bend: 34,
};

export let pointFor = (step: RailStep, track: Track): Point => [railGeometry.x[step], railGeometry.y[track]];
export let entryPoint: Point = [railGeometry.entryX, railGeometry.y.ok];

export function segmentPoints(from: Point, to: Point): Point[] {
  if (from[1] === to[1]) return [from, to];
  let bend = railGeometry.bend;
  return [from, [from[0] + bend, from[1]], [to[0] - bend, to[1]], to];
}

export function railRoute(stops: RailStop[]): RailSegment[] {
  let from = entryPoint;
  let fromTrack: Track = "ok";
  return stops.map((stop, index) => {
    let to = pointFor(stop.step, stop.track);
    let segment = { key: `${index}${fromTrack}-${stop.track}`, points: segmentPoints(from, to) };
    from = to;
    fromTrack = stop.track;
    return segment;
  });
}

export function allSegments(): RailSegment[] {
  let seen = new Map<string, RailSegment>();
  for (let name of railRunNames) {
    for (let segment of railRoute(runRail(name))) seen.set(segment.key, segment);
  }
  return [...seen.values()];
}

export let pathFor = (points: Point[]) => points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
