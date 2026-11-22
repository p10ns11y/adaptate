import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { apiRoute, rewriteHref, routeForDoc, slugifyHeading, sourceOnlyDocs } from "../site/docs-model";
import { guideFrontMatterSchema } from "../site/frontmatter";
import { rewriteLlms } from "../site/llms";

let siteRoot = new URL("../../", import.meta.url);
let repositoryRoot = new URL("../../../../", import.meta.url);

describe("docs", () => {
  it("gives every guide a valid answer-first front matter", () => {
    let names = readdirSync(new URL("docs/", repositoryRoot)).filter((name) => name.endsWith(".md"));
    expect(names.length).toBeGreaterThanOrEqual(16);
    for (let name of names) {
      if (sourceOnlyDocs.has(`docs/${name}`)) continue;
      let markdown = readFileSync(new URL(`docs/${name}`, repositoryRoot), "utf8");
      let block = markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
      let parsed = guideFrontMatterSchema.safeParse(load(block));
      expect(parsed.success, `${name}: ${parsed.error?.message ?? ""}`).toBe(true);
    }
  });

  it("maps docs files to routes and rewrites links", () => {
    expect(routeForDoc("docs/index.md")).toBe("/docs/");
    expect(routeForDoc("docs/zod.md")).toBe("/docs/zod/");
    expect(routeForDoc("docs/api/core/index.md")).toBe("/docs/api/core/");
    expect(routeForDoc("docs/api/core/stream/functions/createFrameThrottle.md")).toBe(
      "/docs/api/core/stream/functions/createFrameThrottle/",
    );
    expect(rewriteHref("streaming.md#push", "docs/ag-ui.md")).toBe("/docs/streaming/#push");
    expect(rewriteHref("../DESIGN.md", "docs/transform.md")).toBe("https://github.com/p10ns11y/adaptate/blob/main/DESIGN.md");
    expect(rewriteHref("../examples/react-view", "docs/index.md")).toBe(
      "https://github.com/p10ns11y/adaptate/tree/main/examples/react-view",
    );
    expect(rewriteHref("../llms.txt", "docs/index.md")).toBe("/llms.txt");
    expect(rewriteHref("credits.md", "docs/index.md")).toBe("https://github.com/p10ns11y/adaptate/blob/main/docs/credits.md");
    expect(rewriteHref("https://example.com", "docs/index.md")).toBe("https://example.com");
  });

  it("derives an answer and FAQ for API pages", () => {
    let route = apiRoute({
      sourcePath: "docs/api/core/stream/functions/createFrameThrottle.md",
      title: "Function: createFrameThrottle()",
      description: "Exported from @adaptate/core/stream.",
      exportNames: [],
    });
    expect(route.answer).toBe(
      'createFrameThrottle is a function exported from @adaptate/core/stream. Import it with import { createFrameThrottle } from "@adaptate/core/stream".',
    );
    expect(route.faq.map((entry) => entry.question)).toEqual([
      "What does createFrameThrottle do?",
      "Which subpath exports createFrameThrottle?",
    ]);
    let documented = apiRoute({
      sourcePath: "docs/api/core/index/functions/transformSchema.md",
      title: "Function: transformSchema()",
      description: "Make fields required/optional based on config. Returns a properly typed Zod schema.",
      exportNames: [],
    });
    expect(documented.answer).toBe("transformSchema: Make fields required/optional based on config. Import it from @adaptate/core.");
  });

  it("makes served llms links absolute", () => {
    let served = rewriteLlms("- [Zod](docs/zod.md): views\n\nSource: docs/api/index.md\n", "https://preview.invalid");
    expect(served).toBe("- [Zod](https://preview.invalid/docs/zod/): views\n\nSource: https://preview.invalid/docs/api/\n");
  });

  it("slugifies heading HTML without leaving markup", () => {
    expect(slugifyHeading("Use <code>transformSchema</code> &amp; Zod")).toBe("use-transformschema-zod");
    expect(slugifyHeading("A&lt;b&gt; tag")).toBe("ab-tag");
    expect(slugifyHeading("<scr<script>ipt>alert(1)</script>")).toBe("iptalert1");
    expect(slugifyHeading("&am<b>p;lt;script")).toBe("ltscript");
    for (let heading of ["<<b>>x", "a < b > c", "x <unclosed", "&&amp;;", "<scr<script>ipt>"]) {
      expect(slugifyHeading(heading)).toMatch(/^[a-z0-9-]*$/);
    }
  });

  it("has no snippet drift", () => {
    let output = execFileSync(process.execPath, ["scripts/snippets.mjs", "--check"], {
      cwd: siteRoot,
      encoding: "utf8",
    });
    expect(output).toMatch(/match/);
  });
});
