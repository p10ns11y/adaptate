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

  it("keeps the copy helper free of network and eval", () => {
    let source = readFileSync(new URL("../../public/snippet-copy.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\(|new Function|innerHTML/);
    expect(source).toContain("navigator.clipboard.writeText");
    expect(source).toContain("Copied to the clipboard.");
    expect(source).not.toMatch(/\b(demo|gate)\b/i);
  });
});
