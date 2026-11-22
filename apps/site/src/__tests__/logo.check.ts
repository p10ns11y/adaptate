import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

let repositoryRoot = new URL("../../../../", import.meta.url);
let read = (path: string) => readFileSync(new URL(path, repositoryRoot), "utf8");

describe("logo", () => {
  it("shows both schemes in the root README", () => {
    let readme = read("README.md");
    expect(readme).toContain('<source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">');
    expect(readme).toContain('src="assets/logo.svg"');
  });

  it("puts the mark in the README shields badges", () => {
    let favicon = read("apps/site/public/favicon.svg").trim();
    let logo = encodeURIComponent(`data:image/svg+xml;base64,${Buffer.from(favicon).toString("base64")}`);
    let readme = read("README.md");
    expect(readme.split(`logo=${logo}`).length - 1).toBeGreaterThanOrEqual(3);
  });

  it("leaves no trace of the old logo geometry", () => {
    let needle = ["M22 36H36", "M36 24V48"].join("");
    let hits = "";
    try {
      hits = execFileSync("git", ["grep", "-l", "-F", "-e", needle], { cwd: repositoryRoot, encoding: "utf8" });
    } catch {
      hits = "";
    }
    expect(hits).toBe("");
  });
});
