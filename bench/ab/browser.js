import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { coldSampleCount, reportBudgetMs, reportRounds } from "./config.js";
import { writeBrowserBundles } from "./bundle.js";
import { createApps } from "./measure.js";
import {
  decodePartials,
  encodePartials,
  orderDocument,
  partialsForDeltas,
  toolCallDeltas,
} from "./order.js";
import { median, percentile } from "./stats.js";

const benchDir = dirname(fileURLToPath(import.meta.url));

function pageHtml(bundleName, encodedPartials, mode) {
  return `<!doctype html>
<meta charset="utf-8">
<body data-ready="0"></body>
<script id="partials" type="application/json">${encodedPartials}</script>
<script type="module">
const encoded = JSON.parse(document.getElementById("partials").textContent);
const partials = encoded.map((entry) => entry.missing ? undefined : entry.value);
const started = performance.now();
const mod = await import("/bundles/${bundleName}");
const accepted = mod.ready();
const coldMs = performance.now() - started;
if (!accepted) throw new Error("rejected");
let report = null;
if (${mode === "work" ? "true" : "false"}) {
  report = mod.report(partials, ${reportRounds}, ${reportBudgetMs});
}
document.body.textContent = JSON.stringify({ coldMs, report });
document.body.dataset.ready = "1";
</script>`;
}

function listen(rootDir, pages) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/bundles/")) {
      const relative = url.pathname.slice("/bundles/".length);
      if (!/^browser-[a-z]+\.js$/.test(relative)) {
        response.statusCode = 404;
        response.end("missing");
        return;
      }
      const file = resolve(rootDir, relative);
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.end(readFileSync(file));
      return;
    }
    const html = pages[url.pathname];
    if (!html) {
      response.statusCode = 404;
      response.end("missing");
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.end(html);
  });
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveListen({
        server,
        port: typeof address === "object" && address ? address.port : 0,
      });
    });
  });
}

function pageFailureText(pageErrors, consoleErrors) {
  return [
    ...pageErrors.map((entry) => `pageerror: ${entry}`),
    ...consoleErrors.map((entry) => `console: ${entry}`),
  ].join("\n");
}

export async function readPage(page, url) {
  const pageErrors = [];
  const consoleErrors = [];
  let settled = false;
  let rejectFailure = () => {};
  const failed = new Promise((_, reject) => {
    rejectFailure = reject;
  });
  failed.catch(() => {});
  const note = (kind, text) => {
    if (kind === "pageerror") pageErrors.push(text);
    else consoleErrors.push(text);
    console.error(`${kind}: ${text}`);
    if (settled) return;
    settled = true;
    rejectFailure(new Error(pageFailureText(pageErrors, consoleErrors)));
  };
  page.on("pageerror", (error) => {
    const text = error instanceof Error ? error.stack || error.message : String(error);
    note("pageerror", text);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("favicon.ico")) return;
    note("console", text);
  });
  await page.goto(url, { waitUntil: "load" });
  try {
    await Promise.race([
      page.waitForFunction(() => document.body.dataset.ready === "1", null, {
        timeout: 120000,
      }),
      failed,
    ]);
  } catch (error) {
    settled = true;
    const detail = pageFailureText(pageErrors, consoleErrors);
    const message = error instanceof Error ? error.message : String(error);
    if (detail.length === 0) throw error;
    if (message === detail) throw error;
    throw new Error(`${detail}\n${message}`);
  }
  settled = true;
  const detail = pageFailureText(pageErrors, consoleErrors);
  if (detail.length > 0) throw new Error(detail);
  return JSON.parse(await page.locator("body").innerText());
}

export async function measureBrowser() {
  const apps = await createApps();
  const workload = toolCallDeltas(orderDocument);
  const partials = partialsForDeltas(workload.deltas, apps.parsePartialJson);
  const encoded = JSON.stringify(encodePartials(partials)).replaceAll(
    "</",
    "<\\/",
  );
  if (decodePartials(JSON.parse(encoded.replaceAll("<\\/", "</"))).length !== partials.length) {
    throw new Error("partial encoding changed the chunk count");
  }
  const bundleDir = await writeBrowserBundles(resolve(benchDir, "../.."));
  const variants = [
    ["zod", "browser-zod.js"],
    ["adaptate", "browser-adaptate.js"],
    ["valibot", "browser-valibot.js"],
  ];
  const pages = {};
  for (const [name, file] of variants) {
    pages[`/cold/${name}`] = pageHtml(file, encoded, "cold");
    pages[`/work/${name}`] = pageHtml(file, encoded, "work");
  }
  const { server, port } = await listen(bundleDir, pages);
  const browser = await chromium.launch({ headless: true });
  try {
    const cold = Object.fromEntries(variants.map(([name]) => [name, []]));
    for (let sample = 0; sample < coldSampleCount; sample += 1) {
      const order = sample % 2 === 0 ? variants : [...variants].reverse();
      for (const [name] of order) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const payload = await readPage(
          page,
          `http://127.0.0.1:${port}/cold/${name}`,
        );
        cold[name].push(payload.coldMs);
        await context.close();
      }
      if (sample % 10 === 0) console.error(`browser cold ${sample}`);
    }
    const work = {};
    for (const [name] of variants) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const payload = await readPage(
        page,
        `http://127.0.0.1:${port}/work/${name}`,
      );
      work[name] = payload.report;
      await context.close();
      console.error(`browser work ${name}`);
    }
    const browserVersion = browser.version();
    const resultVariants = {};
    for (const [name] of variants) {
      resultVariants[name] = {
        coldMedianMs: median(cold[name]),
        coldP95Ms: percentile(cold[name], 0.95),
        validationsPerSec: work[name].validationsPerSec,
        viewsPerSec: work[name].viewsPerSec,
        agUiMicros: work[name].agUiMicros,
        partialMicros: work[name].partialMicros,
        repairMicros: work[name].repairMicros,
        heapAfterBytes: null,
        heapDeltaBytes: null,
        heapCollector: null,
      };
    }
    return {
      runtime: "browser",
      runtimeVersion: browserVersion,
      coldSamples: coldSampleCount,
      rounds: reportRounds,
      budgetMs: reportBudgetMs,
      heapTrials: 0,
      heapValidations: 0,
      documentBytes: workload.bytes,
      chunkCount: workload.deltas.length,
      variants: resultVariants,
    };
  } finally {
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}
