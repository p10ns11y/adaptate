import { createHighlighter, type Highlighter } from "shiki";

import paletteFile from "../../palette.json" with { type: "json" };
import { escapeHtml } from "./head.ts";
import { contrastRatio } from "./palette.ts";

export let snippetThemeName = "adaptate-thrust";

type PaletteFile = { tokens: Record<string, { hex: string }> };

let tokens = (paletteFile as PaletteFile).tokens;

export let snippetTokenColors = {
  background: tokens.void.hex,
  foreground: tokens.cloud.hex,
  comment: "#A3989A",
  string: tokens.exhaust.hex,
  number: tokens.thrust.hex,
  keyword: tokens.sky.hex,
  function: tokens["plume-core"].hex,
  type: "#F3B549",
  invalid: tokens.ember.hex,
} as const;

export function adaptateThrustTheme() {
  return {
    name: snippetThemeName,
    type: "dark" as const,
    colors: {
      "editor.background": snippetTokenColors.background,
      "editor.foreground": snippetTokenColors.foreground,
    },
    tokenColors: [
      { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: snippetTokenColors.comment } },
      { scope: ["string", "string.quoted", "punctuation.definition.string"], settings: { foreground: snippetTokenColors.string } },
      {
        scope: ["constant.numeric", "constant.language", "constant.other", "variable.other.constant"],
        settings: { foreground: snippetTokenColors.number },
      },
      { scope: ["keyword", "keyword.control", "storage", "storage.type", "storage.modifier"], settings: { foreground: snippetTokenColors.keyword } },
      { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: snippetTokenColors.function } },
      { scope: ["entity.name.type", "entity.name.class", "support.type", "support.class"], settings: { foreground: snippetTokenColors.type } },
      { scope: ["entity.name.tag"], settings: { foreground: snippetTokenColors.keyword } },
      { scope: ["entity.other.attribute-name"], settings: { foreground: snippetTokenColors.string } },
      { scope: ["invalid", "invalid.illegal"], settings: { foreground: snippetTokenColors.invalid } },
    ],
  };
}

export let snippetLanguageAliases: Record<string, string> = {
  ts: "ts",
  typescript: "ts",
  tsx: "tsx",
  js: "js",
  javascript: "js",
  jsx: "jsx",
  sh: "shellscript",
  bash: "shellscript",
  shell: "shellscript",
  zsh: "shellscript",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  html: "html",
  rust: "rust",
  rs: "rust",
  toml: "toml",
  md: "markdown",
  markdown: "markdown",
};

export let snippetLanguages = ["ts", "tsx", "js", "jsx", "shellscript", "json", "yaml", "html", "rust", "toml", "markdown"] as const;

export function resolveSnippetLanguage(lang: string | undefined): { grammar: string; label: string } | null {
  if (!lang) return null;
  let label = lang.trim().toLowerCase();
  if (label.length === 0) return null;
  let grammar = snippetLanguageAliases[label];
  if (grammar) return { grammar, label };
  if ((snippetLanguages as readonly string[]).includes(label)) return { grammar: label, label };
  return null;
}

export function tokenContrastAgainstBackground(): Array<{ name: string; ratio: number }> {
  return Object.entries(snippetTokenColors)
    .filter(([name]) => name !== "background")
    .map(([name, hex]) => ({ name, ratio: contrastRatio(hex, snippetTokenColors.background) }));
}

export function wrapSnippet(id: string, label: string, preHtml: string): string {
  let language = label.length > 0 ? label : "text";
  let caption = language === "text" ? "Code snippet" : `${language} snippet`;
  return [
    `<figure class="snippet">`,
    `<figcaption class="snippet-bar">`,
    `<span class="snippet-lang">${escapeHtml(language)}</span>`,
    `<button type="button" class="copy" data-copy="${escapeHtml(id)}" aria-label="Copy ${escapeHtml(caption)}">Copy</button>`,
    `</figcaption>`,
    preHtml,
    `</figure>`,
  ].join("");
}

export function plainSnippetPre(id: string, label: string, text: string): string {
  let language = label.length > 0 ? ` class="language-${escapeHtml(label)}"` : "";
  return `<pre tabindex="0" id="${escapeHtml(id)}"><code${language}>${escapeHtml(text)}</code></pre>`;
}

export type SnippetHighlighter = {
  render: (text: string, lang?: string) => string;
};

export async function createSnippetHighlighter(): Promise<SnippetHighlighter> {
  let highlighter: Highlighter = await createHighlighter({
    themes: [adaptateThrustTheme()],
    langs: [...snippetLanguages],
  });
  let nextId = 0;
  return {
    render(text: string, lang?: string): string {
      nextId += 1;
      let id = `snippet-${nextId}`;
      let resolved = resolveSnippetLanguage(lang);
      let preHtml = resolved
        ? highlighter.codeToHtml(text, {
            lang: resolved.grammar,
            theme: snippetThemeName,
            tabindex: 0,
            transformers: [
              {
                name: "adaptate-snippet-id",
                pre(node) {
                  node.properties.id = id;
                },
              },
            ],
          })
        : plainSnippetPre(id, lang?.trim().toLowerCase() ?? "", text);
      return wrapSnippet(id, resolved?.label ?? lang?.trim().toLowerCase() ?? "text", preHtml);
    },
  };
}

export let snippetCopyRuntime = [
  `<p id="copy-status" class="sr-only" aria-live="polite"></p>`,
  `<script src="/snippet-copy.js" defer></script>`,
].join("\n    ");

export function withSnippetCopy(html: string): string {
  return html.includes('class="snippet"') ? `${snippetCopyRuntime}\n` : "";
}
