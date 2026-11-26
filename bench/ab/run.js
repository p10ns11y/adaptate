import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { agree } from "./agree.js";
import { measureBrowser } from "./browser.js";
import { measureBundles } from "./bundle.js";
import { measureCrossover } from "./crossover.js";
import { renderSummary } from "./summarize.js";

const benchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(benchDir, "../..");
const outDir = resolve(benchDir, "results");
const flags = new Set(process.argv.slice(2));

function runRuntime(command) {
  const result = spawnSync(command, [resolve(benchDir, "runtime-main.js")], {
    cwd: benchDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} runtime-main exited ${result.status}\n${result.stdout ?? ""}`,
    );
  }
  return JSON.parse(result.stdout);
}

mkdirSync(outDir, { recursive: true });
if (!flags.has("--no-crossover")) {
  console.error("crossover");
  const crossover = await measureCrossover();
  writeFileSync(resolve(outDir, "crossover.json"), `${JSON.stringify(crossover, null, 2)}\n`);
}
console.error("agree");
const agreement = await agree();
console.error(`agree ok (${agreement.chunks} chunks, ${agreement.bytes} bytes)`);
console.error("bundle");
const bundle = await measureBundles(repoRoot, "head");
writeFileSync(resolve(outDir, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);

if (!flags.has("--no-node")) {
  console.error("node");
  const node = runRuntime(process.execPath);
  writeFileSync(resolve(outDir, "node.json"), `${JSON.stringify(node, null, 2)}\n`);
}
if (!flags.has("--no-bun")) {
  console.error("bun");
  const bun = runRuntime("bun");
  writeFileSync(resolve(outDir, "bun.json"), `${JSON.stringify(bun, null, 2)}\n`);
}
if (!flags.has("--no-browser")) {
  console.error("browser");
  const browser = await measureBrowser();
  writeFileSync(
    resolve(outDir, "browser.json"),
    `${JSON.stringify(browser, null, 2)}\n`,
  );
}
process.stdout.write(`${renderSummary(outDir)}\n`);
