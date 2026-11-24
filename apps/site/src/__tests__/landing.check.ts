import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { runDemo } from "../landing/demo-model";
import { payloadFor, payloads, samples, type SampleName } from "../landing/samples";
import { stillFrame, streamChunks, streamFrames } from "../landing/stream-model";
import { allSegments, railCode, railRoute, railSummary, runRail, type RailRun } from "../landing/rail-model";
import { agentPrompt, installCommand, landingWords, renderAgents, renderRailIntro } from "../site/landing-copy";
import { renderRailConsole } from "../site/rail";
import { landingRoute } from "../site/routes";

let siteRoot = new URL("../../", import.meta.url);

describe("landing copy", () => {
  it("stays lean", () => {
    let count = landingWords().length;
    expect(count).toBeGreaterThanOrEqual(120);
    expect(count).toBeLessThanOrEqual(200);
  });

  it("uses the value line for the page and OG text", () => {
    expect(landingRoute.description).toBe(landingRoute.answer);
    expect(landingRoute.description.length).toBeLessThanOrEqual(160);
    expect(installCommand).toBe("npm i adaptate @adaptate/utils zod");
  });

  it("ships no network or eval in the landing script", () => {
    let sources = ["main.ts", "demo-model.ts", "demo-view.ts", "zod-print.ts", "samples.ts", "stream-model.ts", "rail-model.ts", "hero-fire.ts", "hero-fire-gl.ts"].map((name) =>
      readFileSync(new URL(`src/landing/${name}`, siteRoot), "utf8"),
    );
    for (let source of sources) {
      expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\(|new Function|innerHTML|getDereferencedOpenAPIDocument|fetchYamlContent/);
      expect(source).not.toMatch(/@adaptate\/utils\/openapi/);
    }
  });
});

describe("railway", () => {
  let tracks = (name: RailRun) => runRail(name).map((stop) => `${stop.step}:${stop.track}`);

  it("runs the real Result chain for each input", () => {
    expect(tracks("stocked")).toEqual(["parse:ok", "map:ok", "flatMap:ok", "recover:ok"]);
    expect(tracks("soldOut")).toEqual(["parse:ok", "map:ok", "flatMap:err", "recover:ok"]);
    expect(tracks("badInput")).toEqual(["parse:err", "map:err", "flatMap:err", "recover:ok"]);
    expect(runRail("badInput").map((stop) => stop.out)).toEqual(["issues at qty", "skipped", "skipped", '{"hold":"check qty"}']);
    expect(railSummary("soldOut", runRail("soldOut"))).toBe('Sold out: flatMap switched to err, recover brought it back. Result {"hold":"mug-02 sold out"}.');
    expect(railSummary("badInput", runRail("badInput"))).toBe('Bad input: parse returned err, recover brought it back. Result {"hold":"check qty"}.');
  });

  it("draws switches only where a run changes track", () => {
    expect(railRoute(runRail("soldOut")).map((segment) => segment.key)).toEqual(["0ok-ok", "1ok-ok", "2ok-err", "3err-ok"]);
    let switches = allSegments().filter((segment) => segment.points.length > 2);
    expect(switches.map((segment) => segment.key).sort()).toEqual(["0ok-err", "2ok-err", "3err-ok"]);
  });

  it("renders a static figure, a trace, and a status without script", () => {
    let html = renderRailConsole();
    expect(html.match(/data-lit/g)).toHaveLength(4);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-pressed="true">Sold out<');
    expect(html.match(/<li data-track=/g)).toHaveLength(4);
  });

  it("links the choke points guide and keeps banned words out of new copy", () => {
    expect(renderRailIntro()).toContain('href="/docs/choke-points/"');
    let text = [renderRailIntro(), renderRailConsole(), railCode, agentPrompt, renderAgents()].join(" ");
    expect(text).not.toMatch(/\b(demo|gate)/i);
    expect(text).not.toMatch(/2\.4\.2/);
    expect(agentPrompt).toContain("choke-points");
    expect(agentPrompt).toContain(installCommand);
    expect(agentPrompt.indexOf("Libraries")).toBeLessThan(agentPrompt.indexOf("Use cases"));
    expect(agentPrompt.indexOf("Use cases")).toBeLessThan(agentPrompt.indexOf("Read first"));
    expect(agentPrompt.indexOf("Read first")).toBeLessThan(agentPrompt.indexOf("Install"));
  });
});

describe("streaming row", () => {
  it("shows JSON.parse failing where adaptate already has typed fields", () => {
    let frames = streamFrames();
    expect(frames.map((frame) => [frame.step, frame.parse, frame.partial, frame.card, frame.kitchen])).toEqual([
      ["chunk 1/5", "✕ SyntaxError", "{}", false, false],
      ["chunk 2/5", "✕ SyntaxError", "{ title: 'Pas' }", true, false],
      ["chunk 3/5", "✕ SyntaxError", "{ title: 'Pasta al limone' }", true, false],
      ["chunk 4/5", "✕ SyntaxError", "{ title: 'Pasta al limone' }", true, false],
      ["chunk 5/5", "✓ parsed", "{ title: 'Pasta al limone', servings: 4 }", true, true],
    ]);
    expect(frames[stillFrame]?.text).toBe('{"title":"Pas');
    expect(frames.at(-1)?.text).toBe(streamChunks.join(""));
  });
});

describe("live demo", () => {
  it("converts the default schema and accepts the valid payload", () => {
    let output = runDemo(samples.schema, payloadFor("schema", null, "valid"));
    expect(output.schemaError).toBeNull();
    expect(output.result).toEqual({ kind: "valid" });
    expect(output.zod).toMatchInlineSnapshot(`
      "z.object({
        title: z.string().min(1),
        servings: z.number().int().min(1),
        diet: z.enum(["vegan", "keto", "any"]).optional(),
        tags: z.array(z.string()).optional(),
      })"
    `);
    expect(output.type).toMatchInlineSnapshot(`
      "{
        title: string;
        servings: number;
        diet?: "vegan" | "keto" | "any";
        tags?: string[];
      }"
    `);
  });

  it("lists the issues of the failing payload", () => {
    let output = runDemo(samples.schema, payloadFor("schema", null, "failing"));
    expect(output.result.kind).toBe("invalid");
    if (output.result.kind !== "invalid") return;
    expect(output.result.issues.map((issue) => issue.path)).toEqual(["title", "servings", "diet"]);
  });

  it("picks an OpenAPI schema and resolves a local $ref on the page side", () => {
    let output = runDemo(samples.openapi, payloadFor("openapi", "Recipe", "failing"));
    expect(output.schemaNames).toEqual(["Recipe", "Author"]);
    expect(output.picked).toBe("Recipe");
    expect(output.notes.join(" ")).toMatch(/picked components\.schemas\.Recipe/);
    expect(output.notes.join(" ")).toMatch(/resolved \$ref #\/components\/schemas\/Author/);
    expect(output.result.kind).toBe("invalid");
    expect(runDemo(samples.openapi, payloadFor("openapi", "Recipe", "valid")).result).toEqual({ kind: "valid" });
    expect(runDemo(samples.openapi, '{"email":"cook@example.com"}', "Author").result).toEqual({ kind: "valid" });
  });

  it("passes Valid and fails Failing for every sample and every pick", () => {
    for (let sample of Object.keys(samples) as SampleName[]) {
      let names = runDemo(samples[sample], "{}").schemaNames;
      let picks = names.length > 0 ? names : [null];
      expect(Object.keys(payloads[sample]).sort()).toEqual(picks.map((pick) => pick ?? "").sort());
      for (let pick of picks) {
        let valid = runDemo(samples[sample], payloadFor(sample, pick, "valid"), pick ?? undefined);
        expect(valid.picked, `${sample} ${pick}`).toBe(pick);
        expect(valid.result, `${sample} ${pick} valid`).toEqual({ kind: "valid" });
        let failing = runDemo(samples[sample], payloadFor(sample, pick, "failing"), pick ?? undefined);
        expect(failing.result.kind, `${sample} ${pick} failing`).toBe("invalid");
      }
    }
  });

  it("does not follow external refs and stops on recursive refs", () => {
    let external = runDemo('{"type":"object","properties":{"a":{"$ref":"https://example.com/a.json"}}}', '{"a":1}');
    expect(external.notes.join(" ")).toMatch(/not followed/);
    let recursive = runDemo('{"$defs":{"n":{"type":"object","properties":{"next":{"$ref":"#/$defs/n"}}}},"$ref":"#/$defs/n"}', "{}");
    expect(recursive.notes.join(" ")).toMatch(/repeats/);
    expect(recursive.result).toEqual({ kind: "valid" });
  });

  it("does not invent a schema for a JSON value", () => {
    expect(runDemo('{"title":"Pasta","servings":4}', "{}").schemaError).toMatch(/not a schema/);
    expect(runDemo("[1, 2]", "{}").schemaError).toMatch(/not a schema/);
    expect(runDemo("title: Pasta", "{}").schemaError).toMatch(/not valid JSON.*not YAML/);
  });

  it("caps input size and depth", () => {
    let big = JSON.stringify({ type: "string", description: "x".repeat(33 * 1024) });
    expect(runDemo(big, '""').schemaError).toMatch(/32 KB/);
    let deep = `${'{"type":"array","items":'.repeat(70)}{"type":"string"}${"}".repeat(70)}`;
    expect(runDemo(deep, "[]").schemaError).toMatch(/deeper than 64/);
    let output = runDemo(samples.schema, "x".repeat(33 * 1024));
    expect(output.result).toMatchObject({ kind: "waiting" });
  });
});
