import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { startStaticServer } from "./static-server.mjs";

let require = createRequire(import.meta.url);
let siteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let distDirectory = join(siteDirectory, "dist");
let routes = JSON.parse(readFileSync(join(siteDirectory, ".site-meta/routes.json"), "utf8"));
let axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
let failures = [];

let server = await startStaticServer(distDirectory);
let browser = await chromium.launch();
try {
  let page = await browser.newPage();
  for (let route of routes) {
    await page.goto(`${server.origin}${route.path}`, { waitUntil: "load" });
    await page.addScriptTag({ content: axeSource });
    let violations = await page.evaluate(async () => {
      let result = await globalThis.axe.run(document, { resultTypes: ["violations"] });
      return result.violations.map((violation) => `${violation.id}: ${violation.nodes.length} node(s) ${violation.nodes[0]?.target.join(" ")}`);
    });
    for (let violation of violations) failures.push(`${route.path}: ${violation}`);
  }

  await page.goto(`${server.origin}/`);
  await page.keyboard.press("Tab");
  let skip = await page.evaluate(() => document.activeElement?.textContent);
  if (skip !== "Skip to content") failures.push(`/: the first Tab stop is "${skip}", not the skip link`);
  await page.locator('[role="tab"]').first().focus();
  await page.keyboard.press("ArrowRight");
  let selected = await page.evaluate(() => document.activeElement?.getAttribute("aria-selected") === "true" && document.activeElement?.textContent);
  if (selected !== "Zod") failures.push(`/: ArrowRight in the example tabs selected "${selected}", not Zod`);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${server.origin}/`);
  let animation = await page.evaluate(() => getComputedStyle(document.querySelector(".ascent span")).animationName);
  if (animation !== "none") failures.push(`/: reduced motion still runs the ascent animation (${animation})`);
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `a11y: ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`a11y passed: axe found 0 violations on ${routes.length} routes; keyboard tabs and reduced motion work.`);
