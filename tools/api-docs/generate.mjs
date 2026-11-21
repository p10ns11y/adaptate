import { Application } from "typedoc";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
      join(repositoryRoot, "packages/core/build/standard.d.ts"),
      join(repositoryRoot, "packages/core/build/effect.d.ts"),
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

let guideOrder = [
  "transform.md",
  "streaming.md",
  "openapi.md",
  "effect.md",
  "typescript.md",
  "subpaths.md",
  "optional-peers.md",
  "performance.md",
  "proof.md",
  "migration-2.4.md",
  "development.md",
];

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function yamlQuote(value) {
  return JSON.stringify(value);
}

function firstParagraph(markdownBody) {
  let lines = markdownBody.split("\n");
  let paragraph = [];
  let started = false;
  for (let line of lines) {
    let trimmed = line.trim();
    if (!started) {
      if (
      trimmed.length === 0 ||
      trimmed.startsWith("#") ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("```") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith("<")
    ) {
        continue;
      }
      started = true;
      paragraph.push(trimmed);
      continue;
    }
    if (trimmed.length === 0 || trimmed.startsWith("```") || trimmed.startsWith("#")) {
      break;
    }
    paragraph.push(trimmed);
  }
  return paragraph.join(" ").replace(/\s+/g, " ").trim();
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    return { frontmatter: {}, body: markdown };
  }
  let end = markdown.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: {}, body: markdown };
  }
  let block = markdown.slice(4, end);
  let body = markdown.slice(end + "\n---\n".length);
  let frontmatter = {};
  for (let line of block.split("\n")) {
    let separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    let key = line.slice(0, separator).trim();
    let rawValue = line.slice(separator + 1).trim();
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      frontmatter[key] = JSON.parse(rawValue);
    } else {
      frontmatter[key] = rawValue;
    }
  }
  return { frontmatter, body };
}

function pageTitle(markdown, fallbackTitle) {
  let parsed = parseFrontmatter(markdown);
  if (typeof parsed.frontmatter.title === "string" && parsed.frontmatter.title.length > 0) {
    return parsed.frontmatter.title;
  }
  let heading = parsed.body.match(/^#\s+(.+)$/m);
  if (heading) {
    return heading[1].trim();
  }
  return fallbackTitle;
}

function shorten(text) {
  let singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length > 180) {
    return `${singleLine.slice(0, 177)}...`;
  }
  return singleLine;
}

function isProse(text) {
  let trimmed = text.trim();
  if (trimmed.length < 12) {
    return false;
  }
  if (trimmed.startsWith("`") || trimmed.startsWith("*") || trimmed.startsWith(">") || trimmed.startsWith("Published declarations")) {
    return false;
  }
  return /[A-Za-z]{3,}\s+[A-Za-z]/.test(trimmed);
}

function pageDescription(markdown, fallbackDescription) {
  let parsed = parseFrontmatter(markdown);
  let writtenDescription = parsed.frontmatter.description;
  if (typeof writtenDescription === "string" && isProse(writtenDescription)) {
    return shorten(writtenDescription);
  }
  let paragraph = firstParagraph(parsed.body);
  if (isProse(paragraph)) {
    return shorten(paragraph);
  }
  return fallbackDescription;
}

function withFrontmatter(markdown, fallbackTitle, fallbackDescription) {
  let parsed = parseFrontmatter(markdown);
  let title = pageTitle(markdown, fallbackTitle);
  let description = pageDescription(markdown, fallbackDescription);
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
      `Exported from ${packageInfo.name}.`,
    );
    writeFileSync(markdownPath, rewritten);
  }
}

function guidePages() {
  let indexPath = join(docsDirectory, "index.md");
  let indexMarkdown = readText(indexPath);
  let linked = new Set();
  for (let match of indexMarkdown.matchAll(/\(([^)]+\.md)\)/g)) {
    linked.add(match[1]);
  }
  let missingFromNav = [];
  for (let guideName of guideOrder) {
    if (!linked.has(guideName) && !linked.has(`./${guideName}`)) {
      missingFromNav.push(guideName);
    }
  }
  if (missingFromNav.length > 0) {
    throw new Error(`docs/index.md does not link ${missingFromNav.join(", ")}`);
  }
  let pages = [
    {
      path: "docs/index.md",
      markdown: indexMarkdown,
    },
  ];
  for (let guideName of guideOrder) {
    let guidePath = join(docsDirectory, guideName);
    let markdown = readText(guidePath);
    let parsed = parseFrontmatter(markdown);
    if (!parsed.frontmatter.title || !parsed.frontmatter.description) {
      throw new Error(`${guideName} needs title and description frontmatter`);
    }
    pages.push({ path: `docs/${guideName}`, markdown });
  }
  return pages;
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

function writeAgentIndexes(pages) {
  let summary = [
    "# Adaptate",
    "",
    "> One description. Each screen checks only what it shows. A cut-off reply does not throw.",
    "",
    "Paths are relative to the repository root. There is no deployed documentation site.",
    "",
    "## Docs",
    "",
  ];
  let full = [
    "# Adaptate",
    "",
    "> One description. Each screen checks only what it shows. A cut-off reply does not throw.",
    "",
  ];
  let apiSummary = ["", "## API", ""];
  for (let page of pages) {
    let title = pageTitle(page.markdown, page.path);
    let description = pageDescription(page.markdown, title);
    let bullet = `- [${title}](${page.path}): ${description}`;
    if (page.path.startsWith("docs/api/")) {
      apiSummary.push(bullet);
    } else {
      summary.push(bullet);
    }
    full.push(`# ${title}`, "", `Source: ${page.path}`, "", page.markdown.trim(), "", "");
  }
  summary.push(...apiSummary, "");
  writeFileSync(join(repositoryRoot, "llms.txt"), `${summary.join("\n")}`);
  writeFileSync(join(repositoryRoot, "llms-full.txt"), `${full.join("\n").trim()}\n`);
}

mkdirSync(apiDirectory, { recursive: true });
rmSync(join(apiDirectory, "core"), { recursive: true, force: true });
rmSync(join(apiDirectory, "utils"), { recursive: true, force: true });

for (let packageInfo of packagesToDocument) {
  await documentPackage(packageInfo);
}

let apiPages = walkMarkdown(apiDirectory)
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
let apiIndex = {
  path: "docs/api/index.md",
  markdown: readText(join(apiDirectory, "index.md")),
  title: "API",
  description: "API reference generated from the published declaration files.",
};
apiPages.push(apiIndex);
apiPages.sort((left, right) => left.path.localeCompare(right.path));

let pages = [...guidePages(), ...apiPages];
writeAgentIndexes(pages);
console.log(`Wrote docs/api, llms.txt, and llms-full.txt (${pages.length} pages).`);
