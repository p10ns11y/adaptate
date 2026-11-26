import { repositoryUrl } from "./config.ts";
import { escapeHtml } from "./head.ts";

export let installCommand = "npm i adaptate @adaptate/utils zod";

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
    { value: "SLSA", unit: "", label: "npm provenance", href: "https://www.npmjs.com/package/adaptate#provenance" },
    { value: "npm", unit: "", label: "latest release", href: "https://www.npmjs.com/package/adaptate" },
    { value: "MIT", unit: "", label: "licensed", href: `${repositoryUrl}/blob/main/LICENSE` },
  ],
  railKicker: "Result API",
  railHeading: "Two tracks. No surprises.",
  railText: "parse returns ok or err. A failing step switches tracks, and recover brings it back.",
  railGuide: { kicker: "Guide", title: "Find your choke points", text: "Guard the few places bad data enters.", href: "/docs/choke-points/" },
  agentsKicker: "For SI agents",
  agentsHeading: "Hand it to your agent.",
  agentsText: "Point it at the docs index or the full text, or paste this prompt.",
  agentsLinks: [
    { label: "/llms.txt", href: "/llms.txt" },
    { label: "/llms-full.txt", href: "/llms-full.txt" },
    { label: "Live benchmark", href: "/docs/accel/#live-benchmark" },
  ],
};

export let telemetry = [
  { label: "stream", value: "3 µs/chunk" },
  { label: "check", value: "0.8 µs" },
  { label: "core", value: "+1.2 KB gzip" },
  { label: "zod", value: "3.25+ / 4" },
];

export let siteUrl = "https://adaptate-site.vercel.app";

export let agentPrompt = [
  "Libraries",
  "adaptate — npm entry for @adaptate/core: dynamic, adaptable model validation with Zod, interoperable with OpenAPI. Default install is zero-dependency aside from the zod peer.",
  "@adaptate/core — One Zod schema; a config chooses the required fields for each consumer. Subpaths include /stream-incremental (makeFeed), /verify, /result, /standard, and /effect.",
  "@adaptate/utils — OpenAPI ↔ Zod conversion and spec loading with local $ref resolution.",
  "@adaptate/accel, @adaptate/wasm, @adaptate/native — optional Advanced packages for large buffers, multi-MB in-memory verification, or a Rust/WASM host embed. Do not add them for small ~3 µs streaming chunks; zero-dep JS is already faster there.",
  "",
  "Use cases",
  "• Each view requires only its fields → transformSchema from adaptate.",
  "• OpenAPI or JSON Schema → Zod → openAPISchemaToZod from @adaptate/utils.",
  "• SI tool calls still streaming → createAgUiPartialValidator from @adaptate/core/stream-incremental.",
  "• Custom stream feed → pass makeFeed to fromAsyncIterableSteps or parseStream.",
  "• In-memory hash or manifest checks before anything is stored → verifyBuffer or verifyStream from @adaptate/core/verify.",
  "• Choke points: guard boundaries where untrusted data enters (API, SI model response, stream, form, import, config file). Use parse or parseStream from @adaptate/core/result; read the guide below.",
  "",
  "Read first",
  `${siteUrl}/docs/`,
  `${siteUrl}/docs/choke-points/`,
  `${siteUrl}/docs/transform/`,
  `${siteUrl}/docs/openapi/`,
  `${siteUrl}/docs/v3/`,
  `${siteUrl}/docs/verification/`,
  `${siteUrl}/docs/accel/`,
  `${siteUrl}/llms.txt`,
  `${siteUrl}/llms-full.txt`,
  "https://www.npmjs.com/package/adaptate",
  "https://www.npmjs.com/package/@adaptate/core",
  "https://www.npmjs.com/package/@adaptate/utils",
  repositoryUrl,
  "",
  "Install",
  installCommand,
  "For parse, parseStream, makeFeed, @adaptate/core/verify, or streamed tool calls, also install @adaptate/core: npm i @adaptate/core",
  "Leave @adaptate/accel, @adaptate/wasm, and @adaptate/native off the default install. Add them only when buffers are large enough to benefit.",
  "The current npm release of @adaptate/core/result exports ok, err, parse, parseAsync and parseStream. If isResult, isSettled, openPath, makeFeed or @adaptate/core/verify from the docs is missing, it ships in the next release.",
  "",
  "Minimal usage (save as check.mjs, run node check.mjs, expect: true true):",
  'import { z } from "zod";',
  'import { transformSchema } from "adaptate";',
  'import { openAPISchemaToZod } from "@adaptate/utils";',
  "const card = transformSchema(z.object({ title: z.string(), servings: z.number() }).partial(), { title: true });",
  'const schema = openAPISchemaToZod({ type: "object", required: ["title"], properties: { title: { type: "string" } } });',
  "console.log(card.safeParse({ title: \"Pasta\" }).success, schema.safeParse({ title: \"Pasta\" }).success);",
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
    landingCopy.railKicker,
    landingCopy.railHeading,
    landingCopy.railText,
    landingCopy.railGuide.kicker,
    landingCopy.railGuide.title,
    landingCopy.railGuide.text,
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

export function renderRailIntro(): string {
  let guide = landingCopy.railGuide;
  return [
    `<div class="rail-intro">`,
    `<p class="kicker">${escapeHtml(landingCopy.railKicker)}</p>`,
    `<h2 id="rail-heading">${escapeHtml(landingCopy.railHeading)}</h2>`,
    `<p>${escapeHtml(landingCopy.railText)}</p>`,
    `<a class="guide-card" href="${guide.href}"><span class="kicker">${escapeHtml(guide.kicker)}</span><strong>${escapeHtml(guide.title)}</strong><span>${escapeHtml(guide.text)}</span><i aria-hidden="true">→</i></a>`,
    `</div>`,
  ].join("");
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
