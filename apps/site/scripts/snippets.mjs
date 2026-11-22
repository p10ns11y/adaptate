import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let siteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let sourceDirectory = join(siteDirectory, "src");
let docsDirectory = resolve(siteDirectory, "../../docs");
let markerPattern = /<!-- snippet: ([\w./-]+) -->\n[\s\S]*?<!-- \/snippet -->/g;

export function syncSnippets(markdown) {
  return markdown.replace(markerPattern, (_match, path) => {
    let source = readFileSync(join(sourceDirectory, path), "utf8").trimEnd();
    let language = extname(path).slice(1);
    return `<!-- snippet: ${path} -->\n\`\`\`${language}\n${source}\n\`\`\`\n<!-- /snippet -->`;
  });
}

let check = process.argv.includes("--check");
let drifted = [];
for (let name of readdirSync(docsDirectory).filter((entry) => entry.endsWith(".md")).sort()) {
  let path = join(docsDirectory, name);
  let markdown = readFileSync(path, "utf8");
  let synced = syncSnippets(markdown);
  if (synced === markdown) continue;
  drifted.push(`docs/${name}`);
  if (!check) writeFileSync(path, synced);
}

if (check && drifted.length > 0) {
  console.error(`Snippet drift in ${drifted.join(", ")}. Run pnpm --filter adaptate-site snippets.`);
  process.exit(1);
}
console.log(check ? "Snippets match their usage files." : `Synced snippets in ${drifted.length} file(s).`);
