import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let exampleDist = fileURLToPath(new URL("../../../examples/live-load/dist/", import.meta.url));
let loadDirectory = fileURLToPath(new URL("../dist/load/", import.meta.url));

cpSync(join(exampleDist, "assets"), join(loadDirectory, "assets"), {
  recursive: true,
  filter: (source) => !source.endsWith(".map"),
});
cpSync(join(exampleDist, "index.html"), join(loadDirectory, "run.html"));

let page = readFileSync(join(loadDirectory, "index.html"), "utf8");
let placeholder = /<p>Until then,[\s\S]*?<\/p>/;
if (!placeholder.test(page)) throw new Error("load page placeholder not found");
page = page.replace(
  placeholder,
  '<iframe class="load-run" src="/load/run.html" title="Streaming load test" loading="eager"></iframe>',
);
writeFileSync(join(loadDirectory, "index.html"), page);
console.log("Wrote the streaming load test to /load/.");
