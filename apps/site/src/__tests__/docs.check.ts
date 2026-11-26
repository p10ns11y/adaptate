import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { apiRoute, groupNav, railDocs, rewriteHref, routeForDoc, slugifyHeading, sourceOnlyDocs } from "../site/docs-model";
import { guideFrontMatterSchema } from "../site/frontmatter";
import { rewriteLlms } from "../site/llms";
import { journeyRoute } from "../site/routes";
import { buildAgentIndexes, guideNames } from "../../../../tools/api-docs/llms.mjs";

let siteRoot = new URL("../../", import.meta.url);
let repositoryRoot = new URL("../../../../", import.meta.url);

describe("docs", () => {
  it("gives every guide a valid answer-first front matter", () => {
    let names = readdirSync(new URL("docs/", repositoryRoot)).filter((name) => name.endsWith(".md"));
    expect(names.length).toBeGreaterThanOrEqual(12);
    for (let name of names) {
      if (sourceOnlyDocs.has(`docs/${name}`)) continue;
      let markdown = readFileSync(new URL(`docs/${name}`, repositoryRoot), "utf8");
      let block = markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";
      let parsed = guideFrontMatterSchema.safeParse(load(block));
      expect(parsed.success, `${name}: ${parsed.error?.message ?? ""}`).toBe(true);
    }
  });

  it("orders the docs nav from first steps to reference and keeps every guide", () => {
    let index = readFileSync(new URL("docs/index.md", repositoryRoot), "utf8");
    let guides = [...index.matchAll(/^- \[([^\]]+)\]\(([\w.-]+\.md)\)/gm)]
      .map((match) => ({ label: match[1] ?? "", path: routeForDoc(`docs/${match[2]}`) }))
      .filter((link) => !link.path.startsWith("/docs/api/"));
    let groups = groupNav([{ label: "Overview", path: "/docs/" }, ...guides]);
    expect(groups.map((group) => group.title)).toEqual(["Start", "Streams", "Advanced", "Reference"]);
    expect(groups[0]?.links.slice(0, 2).map((link) => link.path)).toEqual(["/docs/", "/docs/choke-points/"]);
    expect(groups.flatMap((group) => group.links)).toHaveLength(guides.length + 1);
    for (let path of railDocs) expect(existsSync(new URL(path, repositoryRoot)), path).toBe(true);
  });

  it("maps docs files to routes and rewrites links", () => {
    expect(routeForDoc("docs/index.md")).toBe("/docs/");
    expect(routeForDoc("docs/zod.md")).toBe("/docs/zod/");
    expect(routeForDoc("docs/migration-2.4.md")).toBe("/docs/migration-2-4/");
    expect(routeForDoc("docs/migration-3.0.md")).toBe("/docs/migration-3-0/");
    expect(rewriteHref("migration-2.4.md#peers", "docs/index.md")).toBe("/docs/migration-2-4/#peers");
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
    expect(rewriteHref("../JOURNEY.md", "docs/index.md")).toBe("/journey/");
    expect(rewriteHref("credits.md", "docs/index.md")).toBe("https://github.com/p10ns11y/adaptate/blob/main/docs/credits.md");
    expect(rewriteHref("inspiration.md", "docs/index.md")).toBe("https://github.com/p10ns11y/adaptate/blob/main/docs/inspiration.md");
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

  it("links every guide from the docs index and nothing that is gone", () => {
    let names = readdirSync(new URL("docs/", repositoryRoot)).filter((name) => name.endsWith(".md") && name !== "index.md");
    let linked = guideNames(readFileSync(new URL("docs/index.md", repositoryRoot), "utf8"));
    let unlisted = new Set(["incremental-parser.md", "performance.md", "proof.md"]);
    let guides = names.filter((name) => !sourceOnlyDocs.has(`docs/${name}`) && !unlisted.has(name)).sort();
    expect([...linked].filter((name) => !name.startsWith("api/")).sort()).toEqual(guides);
  });

  it("keeps llms.txt and llms-full.txt in sync with the docs", () => {
    let { llms, llmsFull } = buildAgentIndexes(new URL(".", repositoryRoot).pathname);
    expect(readFileSync(new URL("llms.txt", repositoryRoot), "utf8")).toBe(llms);
    expect(readFileSync(new URL("llms-full.txt", repositoryRoot), "utf8")).toBe(llmsFull);
    for (let match of llms.matchAll(/\]\((docs\/[\w./-]+\.md)\)/g)) {
      expect(existsSync(new URL(match[1] ?? "", repositoryRoot)), match[1]).toBe(true);
    }
  });

  it("makes served llms links absolute", () => {
    let served = rewriteLlms("- [Zod](docs/zod.md): views\n\nSource: docs/api/index.md\n", "https://preview.invalid");
    expect(served).toBe("- [Zod](https://preview.invalid/docs/zod/): views\n\nSource: https://preview.invalid/docs/api/\n");
    expect(rewriteLlms("- [Journey](JOURNEY.md): history\n\nSource: JOURNEY.md\n", "https://preview.invalid")).toBe(
      "- [Journey](https://preview.invalid/journey/): history\n\nSource: https://preview.invalid/journey/\n",
    );
  });

  it("ends no served llms URL with a full stop", () => {
    let { llms, llmsFull } = buildAgentIndexes(new URL(".", repositoryRoot).pathname);
    let served = rewriteLlms(llms, "https://preview.invalid");
    expect(served).toContain("Docs: https://preview.invalid/docs/\n");
    for (let text of [served, rewriteLlms(llmsFull, "https://preview.invalid")]) {
      expect(text).not.toMatch(/https?:\/\/[^\s)>"]+\.(\s|$)/m);
    }
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

  it("keeps the journey lead in sync and lists JOURNEY.md for agents", () => {
    let journey = readFileSync(new URL("JOURNEY.md", repositoryRoot), "utf8");
    let lead = journey
      .split(/\n\n+/)
      .map((part) => part.trim())
      .find((part) => part.length > 0 && !part.startsWith("#") && !part.startsWith("```"));
    expect(lead).toBe(journeyRoute.answer);
    let { llms, llmsFull } = buildAgentIndexes(new URL(".", repositoryRoot).pathname);
    expect(llms).toContain("(JOURNEY.md)");
    expect(llmsFull).toContain("Source: JOURNEY.md");
  });

  it("keeps SI wording and omits banned words in the new v3 guides", () => {
    for (let name of ["v3.md", "accel.md", "verification.md", "index.md", "streaming.md", "migration-3.0.md", "subpaths.md", "optional-peers.md", "proof.md"]) {
      let markdown = readFileSync(new URL(`docs/${name}`, repositoryRoot), "utf8");
      expect(markdown, name).not.toMatch(/\b(demo|gate)\b/i);
      expect(markdown, name).not.toMatch(/(?<![A-Za-z])AI(?![A-Za-z])/);
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
