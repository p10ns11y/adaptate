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
  let clippedSnippets = () =>
    page.evaluate(() =>
      [...document.querySelectorAll(".snippet")].flatMap((snippet, index) => {
        let pre = snippet.querySelector("pre");
        if (!pre) return [`snippet ${index + 1}: missing pre`];
        let figure = snippet.getBoundingClientRect();
        let box = pre.getBoundingClientRect();
        if (box.right > figure.right + 1 || box.left < figure.left - 1) {
          return [`snippet ${index + 1}: pre overflows the figure and is clipped`];
        }
        if (pre.clientWidth > snippet.clientWidth + 1) {
          return [`snippet ${index + 1}: pre is wider than the figure`];
        }
        let overflowX = getComputedStyle(pre).overflowX;
        let whiteSpace = getComputedStyle(pre).whiteSpace;
        let wraps = whiteSpace === "pre-wrap" || whiteSpace === "pre-line" || whiteSpace === "break-spaces";
        let canScroll = overflowX === "auto" || overflowX === "scroll";
        if (pre.scrollWidth > pre.clientWidth + 1 && !canScroll && !wraps) {
          return [`snippet ${index + 1}: long line is clipped`];
        }
        return [];
      }),
    );

  for (let route of routes) {
    await page.goto(`${server.origin}${route.path}`, { waitUntil: "load" });
    await page.addScriptTag({ content: axeSource });
    let violations = await page.evaluate(async () => {
      let result = await globalThis.axe.run(document, { resultTypes: ["violations"] });
      return result.violations.map((violation) => `${violation.id}: ${violation.nodes.length} node(s) ${violation.nodes[0]?.target.join(" ")}`);
    });
    for (let violation of violations) failures.push(`${route.path}: ${violation}`);
    for (let clip of await clippedSnippets()) failures.push(`${route.path} @${page.viewportSize()?.width}px: ${clip}`);
  }

  let snippetRoutes = ["/docs/", "/docs/streaming/", "/docs/v3/", "/docs/accel/", "/docs/verification/"];
  for (let width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    for (let path of snippetRoutes) {
      await page.goto(`${server.origin}${path}`, { waitUntil: "load" });
      let found = await page.locator(".snippet").count();
      if (found === 0) failures.push(`${path} @${width}px: expected snippet blocks`);
      for (let clip of await clippedSnippets()) failures.push(`${path} @${width}px: ${clip}`);
      if (width === 1280 && (path === "/docs/" || path === "/docs/v3/")) {
        let overflow = await page.evaluate(() =>
          [...document.querySelectorAll(".snippet pre")].flatMap((pre, index) =>
            pre.scrollWidth > pre.clientWidth + 1
              ? [`snippet ${index + 1}: scrollWidth ${pre.scrollWidth} > clientWidth ${pre.clientWidth}`]
              : [],
          ),
        );
        for (let issue of overflow) failures.push(`${path} @${width}px: ${issue}`);
      }
    }
  }

  await page.setViewportSize({ width: 1280, height: 800 });
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

  for (let width of [375, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${server.origin}/`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) failures.push(`/: the ${width}px layout scrolls sideways by ${overflow}px`);
  }
  let fireCanvas = await page.evaluate(() => document.querySelector(".hero-art canvas")?.getAttribute("aria-hidden") ?? "none");
  if (fireCanvas !== "none" && fireCanvas !== "true") failures.push("/: the hero canvas is not aria-hidden");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${server.origin}/`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  let animation = await page.evaluate(() => getComputedStyle(document.querySelector(".glow")).animationName);
  if (animation !== "none") failures.push(`/: reduced motion still runs the glow animation (${animation})`);
  if (await page.evaluate(() => document.querySelector(".hero-art canvas") !== null)) failures.push("/: reduced motion still starts the hero WebGL");
} finally {
  await browser.close();
  await server.close();
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `a11y: ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`a11y passed: axe found 0 violations on ${routes.length} routes; the demo works from the keyboard, on mobile, and with reduced motion.`);
