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
  let result = () => page.evaluate(() => document.getElementById("result-title")?.textContent);
  if ((await result()) !== "Valid") failures.push(`/: the demo does not start valid (${await result()})`);
  await page.locator('[data-payload="failing"]').focus();
  await page.keyboard.press("Enter");
  if (!/issue/.test((await result()) ?? "")) failures.push(`/: Enter on the failing sample did not show issues (${await result()})`);
  if ((await page.getAttribute("#result", "aria-live")) !== "polite") failures.push("/: the demo result is not aria-live");
  await page.locator("#schema-input").fill('{"title":"Pasta"}');
  await page.waitForTimeout(300);
  let status = await page.textContent("#schema-status");
  if (!/not a schema/.test(status ?? "")) failures.push(`/: a pasted JSON value was not explained (${status})`);

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`${server.origin}/`);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) failures.push(`/: the mobile layout scrolls sideways by ${overflow}px`);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${server.origin}/`);
  let animation = await page.evaluate(() => getComputedStyle(document.querySelector(".glow")).animationName);
  if (animation !== "none") failures.push(`/: reduced motion still runs the glow animation (${animation})`);
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `a11y: ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`a11y passed: axe found 0 violations on ${routes.length} routes; the demo works from the keyboard, on mobile, and with reduced motion.`);
