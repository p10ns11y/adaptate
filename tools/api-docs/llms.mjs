import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

export function yamlQuote(value) {
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

export function parseFrontmatter(markdown) {
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
    if (/^[\s-]/.test(line)) {
      continue;
    }
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

export function pageTitle(markdown, fallbackTitle) {
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
  if (
    trimmed.startsWith("`") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("Published declarations")
  ) {
    return false;
  }
  return /[A-Za-z]{3,}\s+[A-Za-z]/.test(trimmed);
}

export function pageDescription(markdown, fallbackDescription) {
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

export function guideNames(indexMarkdown) {
  return [...indexMarkdown.matchAll(/^- \[[^\]]+\]\(([\w.-]+\.md)\)/gm)].map((match) => match[1]);
}

export function docsPages(repositoryRoot) {
  let docsDirectory = join(repositoryRoot, "docs");
  let indexMarkdown = readText(join(docsDirectory, "index.md"));
  let pages = [{ path: "docs/index.md", markdown: indexMarkdown }];
  for (let guideName of guideNames(indexMarkdown)) {
    let markdown = readText(join(docsDirectory, guideName));
    let parsed = parseFrontmatter(markdown);
    if (!parsed.frontmatter.title || !parsed.frontmatter.description) {
      throw new Error(`${guideName} needs title and description frontmatter`);
    }
    pages.push({ path: `docs/${guideName}`, markdown });
  }
  let apiPages = walkMarkdown(join(docsDirectory, "api"))
    .map((filePath) => ({ path: relative(repositoryRoot, filePath).replaceAll("\\", "/"), markdown: readText(filePath) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return [...pages, ...apiPages];
}

export function buildAgentIndexes(repositoryRoot) {
  let pages = docsPages(repositoryRoot);
  let journeyPath = join(repositoryRoot, "JOURNEY.md");
  if (existsSync(journeyPath)) {
    pages.splice(1, 0, { path: "JOURNEY.md", markdown: readText(journeyPath) });
  }
  let tagline = parseFrontmatter(pages[0].markdown).frontmatter.description;
  let summary = ["# Adaptate", "", `> ${tagline}`, "", "Paths are relative to the repository root. There is no deployed documentation site.", "", "## Docs", ""];
  let full = ["# Adaptate", "", `> ${tagline}`, ""];
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
  return { llms: summary.join("\n"), llmsFull: `${full.join("\n").trim()}\n`, pageCount: pages.length };
}
