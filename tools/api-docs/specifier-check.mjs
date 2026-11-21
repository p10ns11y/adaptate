import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, "../..");
const apiDirectory = join(repositoryRoot, "docs/api");

function walkMarkdown(directory) {
  let files = [];
  for (let entry of readdirSync(directory, { withFileTypes: true })) {
    let entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdown(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }
  return files;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    return { title: "", description: "" };
  }
  let end = markdown.indexOf("\n---\n", 4);
  if (end === -1) {
    return { title: "", description: "" };
  }
  let frontmatter = { title: "", description: "" };
  for (let line of markdown.slice(4, end).split("\n")) {
    let separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    let key = line.slice(0, separator).trim();
    let rawValue = line.slice(separator + 1).trim();
    if ((key === "title" || key === "description") && rawValue.startsWith('"') && rawValue.endsWith('"')) {
      frontmatter[key] = JSON.parse(rawValue);
    }
  }
  return frontmatter;
}

function documentedSymbol(title, description) {
  let titleMatch = title.match(/^(Function|Class|Interface|Type Alias):\s+([A-Za-z_][A-Za-z0-9_]*)/);
  let specifierMatch = description.match(/^Exported from (@adaptate\/[A-Za-z0-9@/._-]+)\.$/);
  if (!titleMatch || !specifierMatch) {
    return null;
  }
  return {
    kind: titleMatch[1],
    symbolName: titleMatch[2],
    specifier: specifierMatch[1],
  };
}

function resolveBuiltFiles(specifier) {
  let match = specifier.match(/^(@adaptate\/(?:core|utils))(?:\/([A-Za-z0-9._-]+))?$/);
  if (!match) {
    throw new Error(`unrecognized specifier ${specifier}`);
  }
  let packageName = match[1];
  let subpath = match[2] ? `./${match[2]}` : ".";
  let packageDirectory = join(
    repositoryRoot,
    "packages",
    packageName === "@adaptate/utils" ? "utils" : "core",
  );
  let manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
  let exportEntry = manifest.exports[subpath];
  let typesTarget = "";
  let moduleTarget = "";
  if (exportEntry && typeof exportEntry === "object") {
    typesTarget = typeof exportEntry.types === "string" ? exportEntry.types : "";
    moduleTarget = typeof exportEntry.import === "string" ? exportEntry.import : "";
    if (moduleTarget.length === 0 && typeof exportEntry.default === "string") {
      moduleTarget = exportEntry.default;
    }
  } else if (subpath.startsWith("./") && manifest.exports["./*"] && typeof manifest.exports["./*"] === "object") {
    let pattern = manifest.exports["./*"];
    let moduleFolder = subpath.slice("./".length);
    typesTarget = typeof pattern.types === "string" ? pattern.types.replaceAll("*", moduleFolder) : "";
    let patternModule = typeof pattern.import === "string" ? pattern.import : pattern.default;
    moduleTarget = typeof patternModule === "string" ? patternModule.replaceAll("*", moduleFolder) : "";
  }
  if (typesTarget.length === 0 || moduleTarget.length === 0) {
    throw new Error(`${packageName} does not export ${subpath}`);
  }
  let declarationPath = join(packageDirectory, typesTarget);
  let modulePath = join(packageDirectory, moduleTarget);
  if (!statSync(declarationPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`missing declaration ${declarationPath}`);
  }
  if (!statSync(modulePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`missing module ${modulePath}`);
  }
  return { declarationPath, modulePath };
}

function declarationExports(declarationText, symbolName) {
  let direct = new RegExp(
    `export\\s+(?:declare\\s+)?(?:async\\s+)?(?:function|class|interface|type|const|let|var|enum)\\s+${symbolName}\\b`,
  );
  if (direct.test(declarationText)) {
    return true;
  }
  for (let list of declarationText.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (let part of list[1].split(",")) {
      let cleaned = part.trim().replace(/^type\s+/, "");
      let names = cleaned.split(/\s+as\s+/);
      let exportedName = (names[1] ?? names[0] ?? "").trim();
      if (exportedName === symbolName) {
        return true;
      }
    }
  }
  return false;
}

test("each documented specifier exports that symbol from the built package", async () => {
  let documented = [];
  for (let markdownPath of walkMarkdown(apiDirectory)) {
    if (relative(apiDirectory, markdownPath) === "index.md") {
      continue;
    }
    let frontmatter = parseFrontmatter(readFileSync(markdownPath, "utf8"));
    let symbol = documentedSymbol(frontmatter.title, frontmatter.description);
    if (!symbol) {
      continue;
    }
    documented.push({ ...symbol, page: relative(repositoryRoot, markdownPath) });
  }
  assert.ok(documented.length > 0, "no documented specifiers were found");
  let loadedModules = new Map();
  for (let entry of documented) {
    let built = resolveBuiltFiles(entry.specifier);
    let declarationText = readFileSync(built.declarationPath, "utf8");
    assert.ok(
      declarationExports(declarationText, entry.symbolName),
      `${entry.page} says ${entry.specifier} exports ${entry.symbolName}`,
    );
    if (entry.kind !== "Function" && entry.kind !== "Class") {
      continue;
    }
    if (!loadedModules.has(built.modulePath)) {
      loadedModules.set(built.modulePath, await import(pathToFileURL(built.modulePath).href));
    }
    let namespace = loadedModules.get(built.modulePath);
    assert.ok(
      Object.prototype.hasOwnProperty.call(namespace, entry.symbolName),
      `${entry.specifier} module is missing runtime export ${entry.symbolName}`,
    );
  }
});
