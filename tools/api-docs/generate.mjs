import { Application } from "typedoc";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAgentIndexes, pageDescription, pageTitle, parseFrontmatter, readText, yamlQuote } from "./llms.mjs";

let scriptDirectory = dirname(fileURLToPath(import.meta.url));
let repositoryRoot = resolve(scriptDirectory, "../..");
let docsDirectory = join(repositoryRoot, "docs");
let apiDirectory = join(docsDirectory, "api");

let packagesToDocument = [
  {
    name: "@adaptate/core",
    outputDirectory: join(apiDirectory, "core"),
    entryPoints: [
      join(repositoryRoot, "packages/core/build/index.d.ts"),
      join(repositoryRoot, "packages/core/build/stream.d.ts"),
      join(repositoryRoot, "packages/core/build/stream-incremental.d.ts"),
      join(repositoryRoot, "packages/core/build/standard.d.ts"),
      join(repositoryRoot, "packages/core/build/effect.d.ts"),
      join(repositoryRoot, "packages/core/build/result.d.ts"),
      join(repositoryRoot, "packages/core/build/verify.d.ts"),
    ],
  },
  {
    name: "@adaptate/utils",
    outputDirectory: join(apiDirectory, "utils"),
    entryPoints: [
      join(repositoryRoot, "packages/utils/build/index.d.ts"),
      join(repositoryRoot, "packages/utils/build/openapi.d.ts"),
    ],
  },
];

function withFrontmatter(markdown, fallbackTitle, fallbackDescription) {
  let parsed = parseFrontmatter(markdown);
  let title = pageTitle(markdown, fallbackTitle);
  let existingDescription = typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description.trim() : "";
  let markdownForDescription = existingDescription.startsWith("Exported from ")
    ? markdown.replace(/^description:.*$/m, 'description: ""')
    : markdown;
  let description = pageDescription(markdownForDescription, fallbackDescription);
  let body = parsed.body.replace(/^\n+/, "");
  body = body.replace(/\n+\*\*?Generated (?:using|by) TypeDoc[\s\S]*$/i, "\n");
  return `---\ntitle: ${yamlQuote(title)}\ndescription: ${yamlQuote(description)}\n---\n\n${body.trim()}\n`;
}

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

function importSpecifier(packageName, markdownPath) {
  let relativePath = relative(apiDirectory, markdownPath).replaceAll("\\", "/");
  let segments = relativePath.split("/");
  let moduleName = segments[1] ?? "";
  if (moduleName.endsWith(".md")) {
    moduleName = moduleName.slice(0, -".md".length);
  }
  if (moduleName.length === 0 || moduleName === "index") {
    return packageName;
  }
  return `${packageName}/${moduleName}`;
}

function requireDeclaration(filePath) {
  if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing published declaration ${relative(repositoryRoot, filePath)}. Run pnpm build first.`);
  }
}

async function documentPackage(packageInfo) {
  for (let entryPoint of packageInfo.entryPoints) {
    requireDeclaration(entryPoint);
  }
  let application = await Application.bootstrapWithPlugins({
    entryPoints: packageInfo.entryPoints,
    tsconfig: join(scriptDirectory, "tsconfig.json"),
    plugin: ["typedoc-plugin-markdown", "typedoc-plugin-frontmatter"],
    out: packageInfo.outputDirectory,
    name: packageInfo.name,
    readme: "none",
    excludeExternals: true,
    excludeInternal: true,
    excludePrivate: true,
    disableSources: true,
    hideGenerator: true,
    includeVersion: false,
    githubPages: false,
    cleanOutputDir: true,
    includeHierarchySummary: false,
    validation: {
      notExported: false,
      invalidLink: false,
      notDocumented: false,
    },
    logLevel: "Warn",
  });
  application.options.setValue("entryFileName", "index.md");
  application.options.setValue("hidePageHeader", true);
  application.options.setValue("hideBreadcrumbs", true);
  application.options.setValue("useHTMLAnchors", false);
  application.options.setValue("formatWithPrettier", false);
  let project = await application.convert();
  if (!project) {
    throw new Error(`TypeDoc produced no project for ${packageInfo.name}`);
  }
  await application.generateOutputs(project);
  for (let markdownPath of walkMarkdown(packageInfo.outputDirectory)) {
    let markdown = readText(markdownPath);
    let fallbackTitle = packageInfo.name;
    let rewritten = withFrontmatter(
      markdown,
      fallbackTitle,
      `Exported from ${importSpecifier(packageInfo.name, markdownPath)}.`,
    );
    writeFileSync(markdownPath, rewritten);
  }
}

function writeApiIndex(apiPages) {
  let lines = [
    "---",
    `title: ${yamlQuote("API")}`,
    `description: ${yamlQuote("API reference generated from the published declaration files.")}`,
    "---",
    "",
    "# API",
    "",
    "Generated from the `.d.ts` files that ship in `@adaptate/core` and `@adaptate/utils`. Regenerate with `pnpm build` and then `pnpm docs:api`.",
    "",
  ];
  let currentPackage = "";
  for (let apiPage of apiPages) {
    let packageName = apiPage.path.startsWith("docs/api/core/") ? "@adaptate/core" : "@adaptate/utils";
    if (packageName !== currentPackage) {
      if (currentPackage.length > 0) {
        lines.push("");
      }
      lines.push(`## ${packageName}`, "");
      currentPackage = packageName;
    }
    if (apiPage.path.endsWith("/index.md")) {
      continue;
    }
    let link = apiPage.path.slice("docs/api/".length);
    lines.push(`- [${apiPage.title}](${link}): ${apiPage.description}`);
  }
  lines.push("");
  writeFileSync(join(apiDirectory, "index.md"), `${lines.join("\n")}`);
}

mkdirSync(apiDirectory, { recursive: true });
rmSync(join(apiDirectory, "core"), { recursive: true, force: true });
rmSync(join(apiDirectory, "utils"), { recursive: true, force: true });

for (let packageInfo of packagesToDocument) {
  await documentPackage(packageInfo);
}

let apiPages = walkMarkdown(apiDirectory)
  .filter((filePath) => relative(apiDirectory, filePath) !== "index.md")
  .map((filePath) => {
    let path = relative(repositoryRoot, filePath).replaceAll("\\", "/");
    let markdown = readText(filePath);
    return {
      path,
      markdown,
      title: pageTitle(markdown, path),
      description: pageDescription(markdown, path),
    };
  })
  .sort((left, right) => left.path.localeCompare(right.path));

writeApiIndex(apiPages);

let indexes = buildAgentIndexes(repositoryRoot);
writeFileSync(join(repositoryRoot, "llms.txt"), indexes.llms);
writeFileSync(join(repositoryRoot, "llms-full.txt"), indexes.llmsFull);
console.log(`Wrote docs/api, llms.txt, and llms-full.txt (${indexes.pageCount} pages).`);
