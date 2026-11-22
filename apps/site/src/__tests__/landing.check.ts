import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { runDemo } from "../landing/demo-model";
import { payloads, samples } from "../landing/samples";
import { installCommand, landingWords } from "../site/landing-copy";
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
    let sources = ["main.ts", "demo-model.ts", "demo-view.ts", "zod-print.ts", "samples.ts"].map((name) =>
      readFileSync(new URL(`src/landing/${name}`, siteRoot), "utf8"),
    );
    for (let source of sources) {
      expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\(|new Function|innerHTML|getDereferencedOpenAPIDocument|fetchYamlContent/);
      expect(source).not.toMatch(/@adaptate\/utils\/openapi/);
    }
  });
});

describe("live demo", () => {
  it("converts the default schema and accepts the valid payload", () => {
    let output = runDemo(samples.schema, payloads.schema.valid);
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
    let output = runDemo(samples.schema, payloads.schema.failing);
    expect(output.result.kind).toBe("invalid");
    if (output.result.kind !== "invalid") return;
    expect(output.result.issues.map((issue) => issue.path)).toEqual(["title", "servings", "diet"]);
  });

  it("picks an OpenAPI schema and resolves a local $ref on the page side", () => {
    let output = runDemo(samples.openapi, payloads.openapi.failing);
    expect(output.schemaNames).toEqual(["Recipe", "Author"]);
    expect(output.picked).toBe("Recipe");
    expect(output.notes.join(" ")).toMatch(/picked components\.schemas\.Recipe/);
    expect(output.notes.join(" ")).toMatch(/resolved \$ref #\/components\/schemas\/Author/);
    expect(output.result.kind).toBe("invalid");
    expect(runDemo(samples.openapi, payloads.openapi.valid).result).toEqual({ kind: "valid" });
    expect(runDemo(samples.openapi, '{"email":"cook@example.com"}', "Author").result).toEqual({ kind: "valid" });
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
