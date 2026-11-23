import { runDemo } from "./demo-model.ts";
import { resultParts, statusLines } from "./demo-view.ts";
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
    } else if (visible && !document.hidden) {
      if (!timer) tick();
    } else {
      stop();
    }
  };
  new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    sync();
  }).observe(root);
  document.addEventListener("visibilitychange", sync);
  reduced.addEventListener("change", sync);
}

startDemo();
startCopyButtons();
startStream();
