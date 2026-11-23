import { runDemo } from "../landing/demo-model.ts";
import { resultParts, statusLines } from "../landing/demo-view.ts";
import { payloadFor, samples } from "../landing/samples.ts";
import { readyText, stillFrame, streamFrames, type StreamFrame } from "../landing/stream-model.ts";
import { escapeHtml } from "./head.ts";
import { renderTelemetry } from "./landing-copy.ts";

let chip = (attribute: string, value: string, label: string, pressed: boolean) =>
  `<button type="button" class="chip" data-${attribute}="${value}" aria-pressed="${pressed}">${label}</button>`;

let ready = (view: "card" | "kitchen", frame: StreamFrame) =>
  `<span class="ready" data-stream="${view}" data-ready="${frame[view]}">${readyText(view, frame[view])}</span>`;

export function renderStream(frame: StreamFrame): string {
  return [
    `<div id="stream" class="stream" role="group" aria-label="A tool call checked while it streams">`,
    `<span class="stream-tag"><b>T-0</b> Stream <button type="button" id="stream-toggle" class="stream-toggle">Pause</button></span>`,
    `<span class="cell"><small data-stream="step">${escapeHtml(frame.step)}</small> <code data-stream="text">${escapeHtml(frame.text)}</code></span>`,
    `<span class="cell"><small>JSON.parse</small> <span data-stream="parse" data-ok="${frame.parsed}">${escapeHtml(frame.parse)}</span></span>`,
    `<span class="cell"><small>adaptate</small> <code data-stream="partial">${escapeHtml(frame.partial)}</code></span>`,
    `<span class="cell views">${ready("card", frame)}${ready("kitchen", frame)}</span>`,
    `</div>`,
  ].join("");
}

export function renderDemo(): string {
  let schemaText = samples.schema;
  let payloadText = payloadFor("schema", null, "valid");
  let output = runDemo(schemaText, payloadText);
  let result = resultParts(output);
  let status = statusLines(output);
  let frame = streamFrames()[stillFrame];
  let lines = (items: string[]) => items.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  return [
    `<div class="console"><div class="console-in">`,
    `<div class="console-bar">`,
    `<span class="console-id"><i aria-hidden="true"></i>Playground · live</span>`,
    `<div class="chips" role="group" aria-label="Sample schema">${chip("sample", "schema", "JSON Schema", true)}${chip("sample", "openapi", "OpenAPI with $ref", false)}</div>`,
    `<div class="chips seg" role="group" aria-label="Sample payload">${chip("payload", "valid", "Valid", true)}${chip("payload", "failing", "Failing", false)}</div>`,
    `</div>`,
    `<div class="panes">`,
    `<div class="pane">`,
    `<div class="ph"><label for="schema-input"><b>01</b> Schema in</label><span>JSON Schema or OpenAPI</span></div>`,
    `<textarea id="schema-input" rows="12" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="schema-status">${escapeHtml(schemaText)}</textarea>`,
    `<div class="pick" id="pick-row" hidden><label for="schema-pick">Schema to convert</label><select id="schema-pick" autocomplete="off"></select></div>`,
    `<ul id="schema-status" class="status${status.error ? " error" : ""}">${lines(status.lines)}</ul>`,
    `</div>`,
    `<div class="pane">`,
    `<div class="ph"><h3><b>02</b> Zod out</h3><span>openAPISchemaToZod</span></div>`,
    `<pre id="zod-output" tabindex="0" aria-label="Zod schema"><code>${escapeHtml(output.zod)}</code></pre>`,
    `<div class="ph"><h3><b>03</b> TypeScript</h3><span>inferred</span></div>`,
    `<pre id="type-output" tabindex="0" aria-label="Type preview"><code>${escapeHtml(output.type)}</code></pre>`,
    `</div>`,
    `<div class="pane check">`,
    `<div class="ph"><label for="payload-input"><b>04</b> Payload check</label><span>safeParse</span></div>`,
    `<textarea id="payload-input" rows="4" spellcheck="false" autocapitalize="off" autocomplete="off">${escapeHtml(payloadText)}</textarea>`,
    `<div id="result" class="result ${result.tone}" role="status" aria-live="polite" aria-atomic="true"><strong id="result-title">${escapeHtml(result.title)}</strong><ul id="result-lines">${lines(result.lines)}</ul></div>`,
    `</div>`,
    `</div>`,
    renderStream(frame),
    renderTelemetry(),
    `</div></div>`,
  ].join("");
}
