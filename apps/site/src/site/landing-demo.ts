import { runDemo } from "../landing/demo-model.ts";
import { resultParts, statusLines } from "../landing/demo-view.ts";
import { payloadFor, samples } from "../landing/samples.ts";
import { escapeHtml } from "./head.ts";

let chip = (attribute: string, value: string, label: string, pressed: boolean) =>
  `<button type="button" class="chip" data-${attribute}="${value}" aria-pressed="${pressed}">${label}</button>`;

export function renderDemo(): string {
  let schemaText = samples.schema;
  let payloadText = payloadFor("schema", null, "valid");
  let output = runDemo(schemaText, payloadText);
  let result = resultParts(output);
  let status = statusLines(output);
  let lines = (items: string[]) => items.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  return [
    `<div class="demo-grid">`,
    `<div class="demo-inputs">`,
    `<div class="pane"><div class="pane-head"><label for="schema-input">Schema <small>JSON Schema or OpenAPI, as JSON</small></label>`,
    `<div class="chips" role="group" aria-label="Sample schema">${chip("sample", "schema", "JSON Schema", true)}${chip("sample", "openapi", "OpenAPI with $ref", false)}</div></div>`,
    `<textarea id="schema-input" rows="11" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="schema-status">${escapeHtml(schemaText)}</textarea>`,
    `<div class="pick" id="pick-row" hidden><label for="schema-pick">Schema to convert <small>picked by this page</small></label><select id="schema-pick" autocomplete="off"></select></div>`,
    `<ul id="schema-status" class="status${status.error ? " error" : ""}">${lines(status.lines)}</ul></div>`,
    `<div class="pane"><div class="pane-head"><label for="payload-input">Payload <small>edit it</small></label>`,
    `<div class="chips" role="group" aria-label="Sample payload">${chip("payload", "valid", "Valid", true)}${chip("payload", "failing", "Failing", false)}</div></div>`,
    `<textarea id="payload-input" rows="4" spellcheck="false" autocapitalize="off" autocomplete="off">${escapeHtml(payloadText)}</textarea></div>`,
    `</div>`,
    `<div class="demo-outputs">`,
    `<div id="result" class="result ${result.tone}" role="status" aria-live="polite" aria-atomic="true"><strong id="result-title">${escapeHtml(result.title)}</strong><ul id="result-lines">${lines(result.lines)}</ul></div>`,
    `<div class="pane"><div class="pane-head"><h3>Zod schema</h3><small>returned by openAPISchemaToZod</small></div>`,
    `<pre id="zod-output" tabindex="0" aria-label="Zod schema"><code>${escapeHtml(output.zod)}</code></pre></div>`,
    `<div class="pane"><div class="pane-head"><h3>Type preview</h3><small>printed by this page from that Zod schema</small></div>`,
    `<pre id="type-output" tabindex="0" aria-label="Type preview"><code>${escapeHtml(output.type)}</code></pre></div>`,
    `</div>`,
    `</div>`,
  ].join("");
}
