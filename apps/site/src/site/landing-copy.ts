import { repositoryUrl } from "./config.ts";
import { escapeHtml } from "./head.ts";

export let installCommand = "npm i adaptate @adaptate/utils zod";

export let landingCopy = {
  heading: "Typed, validated data from the schema you already have.",
  answer:
    "Paste an OpenAPI or JSON Schema below. adaptate turns it into Zod, so the data your app reads is checked and typed, even while a model is still streaming it.",
  cards: [
    { title: "Your API contract, enforced", text: "OpenAPI and JSON Schema become Zod checks, so a bad response fails loudly instead of breaking a screen." },
    { title: "Streams you can trust early", text: "Check a model's tool call while the JSON is still arriving, and show the fields that are ready." },
    { title: "One schema, every screen", text: "Each card, form, or view requires only its own fields, with types inferred for you." },
  ],
  proof: [
    { label: "2.4.0 on npm", href: "https://www.npmjs.com/package/adaptate" },
    { label: "SLSA provenance", href: "https://registry.npmjs.org/-/npm/v1/attestations/adaptate@2.4.0" },
    { label: "CI on every pull request", href: `${repositoryUrl}/actions/workflows/ci.yml` },
    { label: "MIT licensed", href: `${repositoryUrl}/blob/main/LICENSE` },
  ],
  agentsHeading: "For AI agents",
  agentsText: "Give your agent the docs index or the full text, or paste this prompt.",
  agentsLinks: [
    { label: "llms.txt", href: "/llms.txt" },
    { label: "llms-full.txt", href: "/llms-full.txt" },
  ],
};

export let agentPrompt = [
  `Use adaptate to validate data in this project. Run: ${installCommand}`,
  `Read ${repositoryUrl}/blob/main/llms.txt first.`,
  `Convert an OpenAPI or JSON Schema with openAPISchemaToZod from "@adaptate/utils", then call safeParse on the result.`,
  `Use transformSchema from "adaptate" to require only the fields a view needs.`,
  `For streamed tool calls, add @adaptate/core and use createAgUiPartialValidator from "@adaptate/core/stream".`,
].join("\n");

export function landingWords(): string[] {
  let text = [
    landingCopy.heading,
    landingCopy.answer,
    ...landingCopy.cards.flatMap((card) => [card.title, card.text]),
    ...landingCopy.proof.map((item) => item.label),
    landingCopy.agentsHeading,
    landingCopy.agentsText,
    ...landingCopy.agentsLinks.map((link) => link.label),
  ].join(" ");
  return text.split(/\s+/).filter((word) => /[\w]/.test(word));
}

let copyButton = (target: string, label: string) =>
  `<button type="button" class="copy" data-copy="${target}" aria-label="${escapeHtml(label)}">Copy</button>`;

export function renderInstall(): string {
  return `<div class="install"><code id="install-command">${escapeHtml(installCommand)}</code>${copyButton("install-command", "Copy the install command")}</div>`;
}

export function renderCards(): string {
  let items = landingCopy.cards.map((card) => `<li><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.text)}</p></li>`).join("");
  return `<ul class="cards">${items}</ul>`;
}

export function renderProof(): string {
  let items = landingCopy.proof.map((item) => `<li><a href="${item.href}">${escapeHtml(item.label)}</a></li>`).join("");
  return `<ul class="proof" aria-label="Verifiable facts">${items}</ul>`;
}

export function renderAgents(): string {
  let links = landingCopy.agentsLinks.map((link) => `<a class="button ghost" href="${link.href}">${escapeHtml(link.label)}</a>`).join("");
  return [
    `<h2 id="agents-heading">${escapeHtml(landingCopy.agentsHeading)}</h2>`,
    `<p>${escapeHtml(landingCopy.agentsText)}</p>`,
    `<div class="actions">${links}</div>`,
    `<div class="prompt"><pre tabindex="0" aria-label="Prompt for an agent"><code id="agent-prompt">${escapeHtml(agentPrompt)}</code></pre>${copyButton("agent-prompt", "Copy the agent prompt")}</div>`,
  ].join("");
}
