import { repositoryUrl } from "./config.ts";
import { escapeHtml } from "./head.ts";

export let installCommand = "npm i adaptate @adaptate/utils zod";
export let releaseVersion = "2.4.1";

let performancePage = "/docs/performance/#measured";

export let landingCopy = {
  eyebrow: "Zod 3.25+ and 4 · MIT",
  heading: "Typed, validated data from any schema or stream. Safely.",
  headingGlow: "Safely.",
  answer:
    "Paste OpenAPI or JSON Schema, get Zod and TypeScript in one call, and check an SI model's output while it is still streaming.",
  valueKicker: "What it buys you",
  valueHeading: "Fewer broken screens. Faster answers.",
  cards: [
    { title: "Bad responses fail loudly", text: "Your API contract becomes a check. A broken payload lands in a log, not on a customer's screen." },
    { title: "Show answers before they finish", text: "Check an SI tool call while it streams. Each view knows the moment its fields are ready." },
    { title: "One schema, every screen", text: "Each view requires only its own fields, typed for you. No hand-copied types to drift." },
  ],
  proof: [
    { value: "3", unit: "µs", label: "per streamed chunk", href: performancePage },
    { value: "+1.2", unit: "KB", label: "core gzip on top of Zod", href: performancePage },
    { value: "5%", unit: "", label: "slower fails the PR", href: `${repositoryUrl}/actions/workflows/ci.yml` },
    { value: "SLSA", unit: "", label: "npm provenance", href: `https://registry.npmjs.org/-/npm/v1/attestations/adaptate@${releaseVersion}` },
    { value: releaseVersion, unit: "", label: "on npm", href: "https://www.npmjs.com/package/adaptate" },
    { value: "MIT", unit: "", label: "licensed", href: `${repositoryUrl}/blob/main/LICENSE` },
  ],
  agentsKicker: "For SI agents",
  agentsHeading: "Hand it to your agent.",
  agentsText: "Point it at the docs index or the full text, or paste this prompt.",
  agentsLinks: [
    { label: "/llms.txt", href: "/llms.txt" },
    { label: "/llms-full.txt", href: "/llms-full.txt" },
  ],
};

export let telemetry = [
  { label: "stream", value: "3 µs/chunk" },
  { label: "check", value: "0.8 µs" },
  { label: "core", value: "+1.2 KB gzip" },
  { label: "zod", value: "3.25+ / 4" },
];

export let agentPrompt = [
  `Use adaptate to validate data in this project. Run: ${installCommand}`,
  `Read ${repositoryUrl}/blob/main/llms.txt first.`,
  `Convert an OpenAPI or JSON Schema with openAPISchemaToZod from "@adaptate/utils", then call safeParse on the result.`,
  `Use transformSchema from "adaptate" to require only the fields a view needs.`,
  `For streamed tool calls, add @adaptate/core and use createAgUiPartialValidator from "@adaptate/core/stream-incremental".`,
].join("\n");

export function landingWords(): string[] {
  let text = [
    landingCopy.eyebrow,
    landingCopy.heading,
    landingCopy.answer,
    landingCopy.valueKicker,
    landingCopy.valueHeading,
    ...landingCopy.cards.flatMap((card) => [card.title, card.text]),
    ...landingCopy.proof.map((item) => `${item.value}${item.unit} ${item.label}`),
    landingCopy.agentsKicker,
    landingCopy.agentsHeading,
    landingCopy.agentsText,
    ...landingCopy.agentsLinks.map((link) => link.label),
  ].join(" ");
  return text.split(/\s+/).filter((word) => /[\w]/.test(word));
}

let copyButton = (target: string, label: string) =>
  `<button type="button" class="copy" data-copy="${target}" aria-label="${escapeHtml(label)}">Copy</button>`;

export function renderEyebrow(): string {
  return escapeHtml(landingCopy.eyebrow);
}

export function renderHeading(): string {
  let glow = escapeHtml(landingCopy.headingGlow);
  return escapeHtml(landingCopy.heading).replace(glow, `<em>${glow}</em>`);
}

export function renderInstall(): string {
  return `<div class="install"><code id="install-command">${escapeHtml(installCommand)}</code>${copyButton("install-command", "Copy the install command")}</div>`;
}

export function renderTelemetry(): string {
  let items = telemetry.map((item) => `<li>${escapeHtml(item.label)} <b>${escapeHtml(item.value)}</b></li>`).join("");
  return `<ul class="telemetry" aria-label="Measured facts">${items}</ul>`;
}

let icons = [
  `<rect class="o" x="4" y="6" width="32" height="28" rx="6"/><path class="t" d="M13 20l5 5 9-11"/>`,
  `<path class="o" d="M6 28h6M16 28h6M26 28h8"/><path class="t" d="M6 18h28"/><circle class="p" cx="34" cy="18" r="3"/>`,
  `<circle class="t" cx="20" cy="9" r="4"/><path class="o" d="M20 13v6M20 19L9 29M20 19l11 10M20 19v11"/>`,
];

export function renderCards(): string {
  let items = landingCopy.cards
    .map((card, index) => {
      let icon = `<svg viewBox="0 0 40 40" aria-hidden="true" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[index] ?? ""}</svg>`;
      return `<li data-n="0${index + 1}">${icon}<h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.text)}</p></li>`;
    })
    .join("");
  return [
    `<p class="kicker">${escapeHtml(landingCopy.valueKicker)}</p>`,
    `<h2 id="value-heading">${escapeHtml(landingCopy.valueHeading)}</h2>`,
    `<ul class="cards">${items}</ul>`,
  ].join("");
}

export function renderProof(): string {
  let items = landingCopy.proof
    .map((item) => {
      let unit = item.unit ? `<small>${escapeHtml(item.unit)}</small>` : "";
      return `<li><a href="${item.href}"><span class="v">${escapeHtml(item.value)}${unit}</span><span class="l">${escapeHtml(item.label)}</span></a></li>`;
    })
    .join("");
  return `<ul class="proof wide">${items}</ul>`;
}

export function renderAgents(): string {
  let links = landingCopy.agentsLinks.map((link) => `<a class="button ghost" href="${link.href}">${escapeHtml(link.label)}</a>`).join("");
  return [
    `<div>`,
    `<p class="kicker">${escapeHtml(landingCopy.agentsKicker)}</p>`,
    `<h2 id="agents-heading">${escapeHtml(landingCopy.agentsHeading)}</h2>`,
    `<p>${escapeHtml(landingCopy.agentsText)}</p>`,
    `<div class="actions">${links}</div>`,
    `</div>`,
    `<div class="prompt"><div class="prompt-bar"><span class="console-id"><i aria-hidden="true"></i>Agent prompt</span>${copyButton("agent-prompt", "Copy the agent prompt")}</div>`,
    `<pre tabindex="0" aria-label="Prompt for an agent"><code id="agent-prompt">${escapeHtml(agentPrompt)}</code></pre></div>`,
  ].join("");
}
