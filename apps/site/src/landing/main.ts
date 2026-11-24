import { runDemo } from "./demo-model.ts";
import { resultParts, statusLines } from "./demo-view.ts";
import {
  defaultRun,
  entryPoint,
  pointFor,
  railRoute,
  railRunNames,
  railSummary,
  runRail,
  type Point,
  type RailRun,
  type RailStop,
} from "./rail-model.ts";
import { lightFireLater } from "./hero-fire.ts";
import { payloadFor, samples, type PayloadKind, type SampleName } from "./samples.ts";
import { readyText, stillFrame, streamFrames, type StreamFrame } from "./stream-model.ts";

let byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function fillList(list: HTMLElement, lines: string[]) {
  list.replaceChildren(
    ...lines.map((line) => {
      let item = document.createElement("li");
      item.textContent = line;
      return item;
    }),
  );
}

function press(group: string, value: string) {
  for (let button of document.querySelectorAll<HTMLButtonElement>(`[data-${group}]`)) {
    button.setAttribute("aria-pressed", String(button.dataset[group] === value));
  }
}

function startDemo() {
  let schemaInput = byId<HTMLTextAreaElement>("schema-input");
  let payloadInput = byId<HTMLTextAreaElement>("payload-input");
  let pick = byId<HTMLSelectElement>("schema-pick");
  let pickRow = byId("pick-row");
  let status = byId("schema-status");
  let result = byId("result");
  let resultTitle = byId("result-title");
  let resultLines = byId("result-lines");
  let zodOutput = byId("zod-output");
  let typeOutput = byId("type-output");
  if (!schemaInput || !payloadInput || !pick || !pickRow || !status || !result || !resultTitle || !resultLines || !zodOutput || !typeOutput) return;
  let sample: SampleName = "schema";
  let kind: PayloadKind = "valid";
  let timer = 0;

  let update = () => {
    let output = runDemo(schemaInput.value, payloadInput.value, pick.value || undefined);
    let statusParts = statusLines(output);
    status.classList.toggle("error", statusParts.error);
    fillList(status, statusParts.lines);
    pickRow.hidden = output.schemaNames.length < 2;
    if (pick.options.length !== output.schemaNames.length || output.schemaNames.some((name, index) => pick.options[index]?.value !== name)) {
      pick.replaceChildren(...output.schemaNames.map((name) => new Option(name, name)));
    }
    if (output.picked) pick.value = output.picked;
    zodOutput.firstElementChild?.replaceChildren(output.zod);
    typeOutput.firstElementChild?.replaceChildren(output.type);
    let parts = resultParts(output);
    result.className = `result ${parts.tone}`;
    resultTitle.textContent = parts.title;
    fillList(resultLines, parts.lines);
  };

  let schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 120);
  };

  schemaInput.addEventListener("input", () => {
    pick.value = "";
    schedule();
  });
  payloadInput.addEventListener("input", schedule);
  pick.addEventListener("change", () => {
    payloadInput.value = payloadFor(sample, pick.value, kind);
    update();
  });

  for (let button of document.querySelectorAll<HTMLButtonElement>("[data-sample]")) {
    button.addEventListener("click", () => {
      sample = button.dataset.sample === "openapi" ? "openapi" : "schema";
      kind = "valid";
      press("sample", sample);
      press("payload", kind);
      schemaInput.value = samples[sample];
      pick.value = "";
      update();
      payloadInput.value = payloadFor(sample, pick.value || null, kind);
      update();
    });
  }
  for (let button of document.querySelectorAll<HTMLButtonElement>("[data-payload]")) {
    button.addEventListener("click", () => {
      kind = button.dataset.payload === "failing" ? "failing" : "valid";
      press("payload", kind);
      payloadInput.value = payloadFor(sample, pick.value || null, kind);
      update();
    });
  }
  update();
}

function startCopyButtons() {
  for (let button of document.querySelectorAll<HTMLButtonElement>("button[data-copy]")) {
    button.addEventListener("click", () => {
      let text = document.getElementById(button.dataset.copy ?? "")?.textContent ?? "";
      let done = (label: string) => {
        button.textContent = label;
        let live = document.getElementById("copy-status");
        if (live) live.textContent = label === "Copied" ? "Copied to the clipboard." : "Copy failed. Select the text and copy it.";
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1600);
      };
      navigator.clipboard.writeText(text).then(
        () => done("Copied"),
        () => done("Select and copy"),
      );
    });
  }
}

function startStream() {
  let root = byId("stream");
  if (!root) return;
  let field = (name: string) => root.querySelector<HTMLElement>(`[data-stream="${name}"]`);
  let step = field("step");
  let text = field("text");
  let parse = field("parse");
  let partial = field("partial");
  let card = field("card");
  let kitchen = field("kitchen");
  if (!step || !text || !parse || !partial || !card || !kitchen) return;
  let frames = streamFrames();
  let paint = (frame: StreamFrame) => {
    step.textContent = frame.step;
    text.textContent = frame.text;
    parse.textContent = frame.parse;
    parse.dataset.ok = String(frame.parsed);
    partial.textContent = frame.partial;
    card.textContent = readyText("card", frame.card);
    card.dataset.ready = String(frame.card);
    kitchen.textContent = readyText("kitchen", frame.kitchen);
    kitchen.dataset.ready = String(frame.kitchen);
  };
  let reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let index = 0;
  let timer = 0;
  let visible = false;
  let paused = false;
  let toggle = byId<HTMLButtonElement>("stream-toggle");
  let stop = () => {
    window.clearTimeout(timer);
    timer = 0;
  };
  let tick = () => {
    let frame = frames[index];
    if (frame) paint(frame);
    timer = window.setTimeout(tick, index === frames.length - 1 ? 2600 : 900);
    index = (index + 1) % frames.length;
  };
  let sync = () => {
    if (reduced.matches) {
      stop();
      let still = frames[stillFrame];
      if (still) paint(still);
    } else if (visible && !document.hidden && !paused) {
      if (!timer) tick();
    } else {
      stop();
    }
  };
  new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    sync();
  }).observe(root);
  toggle?.addEventListener("click", () => {
    paused = !paused;
    toggle.textContent = paused ? "Play" : "Pause";
    sync();
  });
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
}

function traceLine(stop: RailStop) {
  let item = document.createElement("li");
  item.dataset.track = stop.track;
  if (stop.skipped) item.dataset.skipped = "";
  let parts = [stop.call, stop.track, stop.out].map((text, index) => {
    let part = document.createElement(["code", "b", "span"][index] ?? "span");
    part.textContent = text;
    return part;
  });
  item.append(...parts);
  return item;
}

function glide(token: SVGElement, points: Point[], duration: number) {
  let lengths = points.map((point, index) => {
    let previous = points[index - 1] ?? point;
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  });
  let total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let travelled = 0;
  let frames = points.map(([x, y], index) => {
    travelled += lengths[index] ?? 0;
    return { transform: `translate(${x}px, ${y}px)`, offset: travelled / total };
  });
  token.animate(frames, { duration, easing: "cubic-bezier(0.45, 0, 0.2, 1)" });
}

function startRail() {
  let root = document.querySelector<HTMLElement>(".rail-console");
  let figure = root?.querySelector<HTMLElement>(".rail");
  let token = root?.querySelector<SVGElement>(".token");
  let trace = byId("rail-trace");
  let status = byId("rail-status");
  if (!root || !figure || !token || !trace || !status) return;
  let reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let timers: number[] = [];
  let place = ([x, y]: Point) => token.setAttribute("transform", `translate(${x} ${y})`);
  let run = (name: RailRun, animate: boolean) => {
    for (let timer of timers) window.clearTimeout(timer);
    timers = [];
    for (let animation of token.getAnimations()) animation.cancel();
    press("run", name);
    let stops = runRail(name);
    let route = railRoute(stops);
    let lines = stops.map(traceLine);
    let lit = new Set(route.map((segment) => segment.key));
    let segments = [...root.querySelectorAll<SVGElement>("[data-seg]")];
    let summary = railSummary(name, stops);
    let last = stops.at(-1);
    if (animate) root.dataset.running = "";
    trace.replaceChildren(...lines);
    for (let segment of segments) segment.toggleAttribute("data-lit", !animate && lit.has(segment.dataset.seg ?? ""));
    if (!animate || !last) {
      delete root.dataset.running;
      if (last) place(pointFor(last.step, last.track));
      figure.dataset.track = last?.track ?? "ok";
      status.textContent = summary;
      return;
    }
    place(entryPoint);
    figure.dataset.track = "ok";
    route.forEach((segment, index) => {
      timers.push(
        window.setTimeout(() => {
          let end = segment.points.at(-1) ?? entryPoint;
          glide(token, segment.points, 620);
          place(end);
          segments.find((path) => path.dataset.seg === segment.key)?.setAttribute("data-lit", "");
          lines[index]?.setAttribute("data-on", "");
          figure.dataset.track = stops[index]?.track ?? "ok";
        }, 160 + index * 780),
      );
    });
    timers.push(
      window.setTimeout(() => {
        delete root.dataset.running;
        status.textContent = summary;
      }, 160 + route.length * 780),
    );
  };
  let current: RailRun = defaultRun;
  for (let button of root.querySelectorAll<HTMLButtonElement>("[data-run]")) {
    button.addEventListener("click", () => {
      current = railRunNames.find((name) => name === button.dataset.run) ?? defaultRun;
      run(current, !reduced.matches);
    });
  }
  if (reduced.matches) return;
  let seen = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      run(current, !reduced.matches);
    },
    { threshold: 0.45 },
  );
  seen.observe(figure);
}

function startReveal() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let observer = new IntersectionObserver(
    (entries) => {
      for (let entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.remove("pending");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  for (let element of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
    if (element.getBoundingClientRect().top < window.innerHeight) continue;
    element.classList.add("pending");
    observer.observe(element);
  }
}

function startFire() {
  let art = document.querySelector<HTMLElement>(".hero-art");
  if (!art) return;
  lightFireLater(() => {
    import("./hero-fire-gl.ts")
      .then(({ lightFire }) => lightFire(art))
      .catch(() => undefined);
  });
}

startDemo();
startCopyButtons();
startStream();
startRail();
startReveal();
startFire();
