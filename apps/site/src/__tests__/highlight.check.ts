import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createSnippetHighlighter,
  resolveSnippetLanguage,
  snippetCopyRuntime,
  tokenContrastAgainstBackground,
  wrapSnippet,
} from "../site/highlight";

describe("docs snippet highlighting", () => {
  it("keeps every token color at WCAG AA on the void background", () => {
    for (let token of tokenContrastAgainstBackground()) {
      expect(token.ratio, token.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("maps short language labels onto grammars", () => {
    expect(resolveSnippetLanguage("ts")).toEqual({ grammar: "ts", label: "ts" });
    expect(resolveSnippetLanguage("bash")).toEqual({ grammar: "shellscript", label: "bash" });
    expect(resolveSnippetLanguage("yml")).toEqual({ grammar: "yaml", label: "yml" });
    expect(resolveSnippetLanguage("")).toBeNull();
    expect(resolveSnippetLanguage("made-up")).toBeNull();
  });

  it("highlights TypeScript at build time and wraps a copy control", async () => {
    let highlight = await createSnippetHighlighter();
    let html = highlight.render('const title: string = "Pasta";', "ts");
    expect(html).toContain('class="snippet"');
    expect(html).toContain("snippet-lang");
    expect(html).toContain("data-copy=\"snippet-1\"");
    expect(html).toContain("aria-label=\"Copy ts snippet\"");
    expect(html).toContain("id=\"snippet-1\"");
    expect(html).toMatch(/style="[^"]*color:#7AAED6/i);
    expect(html).toContain("const");
    expect(html).toContain("Pasta");
    expect(html).not.toContain("<script");
  });

  it("still wraps unknown languages as selectable plain text", async () => {
    let highlight = await createSnippetHighlighter();
    let html = highlight.render("echo hi", "made-up");
    expect(html).toContain('class="snippet"');
    expect(html).toContain(">made-up</span>");
    expect(html).toContain("echo hi");
    expect(html).not.toContain("shiki");
  });

  it("reserves a stable copy button and a live region with no layout-shifting markup", () => {
    let chrome = wrapSnippet("snippet-9", "ts", '<pre id="snippet-9"><code>ok</code></pre>');
    expect(chrome).toContain(">Copy</button>");
    expect(chrome).toContain('class="snippet-bar"');
    expect(snippetCopyRuntime).toContain('id="copy-status"');
    expect(snippetCopyRuntime).toContain('aria-live="polite"');
    expect(snippetCopyRuntime).toContain('src="/snippet-copy.js"');
  });

  it("constrains snippet pre so long lines scroll on desktop and wrap at 680px", () => {
    let css = readFileSync(new URL("../../public/site.css", import.meta.url), "utf8");
    let block = (selector: string) => css.match(new RegExp(`${selector.replaceAll(".", "\\.")} \\{([^}]+)\\}`))?.[1] ?? "";
    let snippet = block(".snippet");
    let pre = block(".snippet pre");
    expect(snippet).toMatch(/min-width:\s*0/);
    expect(snippet).toMatch(/max-width:\s*100%/);
    expect(pre).toMatch(/min-width:\s*0/);
    expect(pre).toMatch(/max-width:\s*100%/);
    expect(pre).toMatch(/overflow-x:\s*auto/);
    expect(pre).toMatch(/scrollbar-width:\s*thin/);
    expect(pre).toMatch(/scrollbar-color:\s*var\(--ocean\)\s+var\(--void\)/);
    expect(css).toMatch(/@media \(max-width: 680px\) \{[\s\S]*?\.snippet pre \{[^}]*white-space:\s*pre-wrap/);
    expect(css).toMatch(/@media \(max-width: 680px\) \{[\s\S]*?\.snippet pre \{[^}]*overflow-wrap:\s*anywhere/);
  });

  it("keeps the copy helper free of network and eval", () => {
    let source = readFileSync(new URL("../../public/snippet-copy.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\(|new Function|innerHTML/);
    expect(source).toContain("navigator.clipboard.writeText");
    expect(source).toContain("Copied to the clipboard.");
    expect(source).not.toMatch(/\b(demo|gate)\b/i);
  });
});
