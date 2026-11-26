import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defaultSiteUrl, resolveSiteUrl } from "../site/config";
import { renderHead } from "../site/head";
import { renderFooter, renderHeader } from "../site/header";
import { guideRoute } from "../site/docs-model";
import { allowedDocsScript, checkPage, extractPage } from "../site/seo-rules";

let route = guideRoute("docs/zod.md", {
  title: "Zod",
  answer: "Write one Zod schema, then give each view a Config that marks the fields it needs for that screen.",
  faq: [
    { question: "Which Zod versions are supported?", answer: "zod ^3.25.0 or ^4.0.0." },
    { question: "Is the result still a Zod schema?", answer: "Yes, with parse and safeParse." },
  ],
});

function fixture(head: string): string {
  return `<!doctype html><html lang="en"><head>${head}</head><body>${renderHeader(route.kind)}<main id="main"><h1>Zod</h1><p class="answer">${route.answer}</p></main>${renderFooter()}</body></html>`;
}

let goodHead = renderHead(route, { siteUrl: defaultSiteUrl, version: "2.3.0" });
let browser: Browser;

async function issuesFor(html: string): Promise<string[]> {
  let page = await browser.newPage();
  await page.setContent(html);
  let extracted = await page.evaluate(extractPage);
  await page.close();
  return checkPage(extracted, route, defaultSiteUrl);
}

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

describe("seo-check rules", () => {
  it("passes a complete docs page", async () => {
    expect(await issuesFor(fixture(goodHead))).toEqual([]);
  });

  it("fails a page that drops og:image", async () => {
    let head = goodHead.replace(/<meta property="og:image" [^>]+>/, "");
    expect((await issuesFor(fixture(head))).join("\n")).toMatch(/og:image/);
  });

  it("fails a bad JSON-LD @type", async () => {
    let head = goodHead.replace('"@type":"FAQPage"', '"@type":"FAQ"');
    let issues = (await issuesFor(fixture(head))).join("\n");
    expect(issues).toMatch(/JSON-LD @type/);
    expect(issues).toMatch(/exactly one FAQPage/);
  });

  it("fails a non-absolute canonical", async () => {
    let head = goodHead.replace(`href="${defaultSiteUrl}/docs/zod/"`, 'href="/docs/zod/"');
    expect((await issuesFor(fixture(head))).join("\n")).toMatch(/canonical/);
  });

  it("fails a docs page that ships a script or loses its answer", async () => {
    let html = fixture(goodHead).replace(`<p class="answer">${route.answer}</p>`, "<p>Intro</p><script>1</script>");
    let issues = (await issuesFor(html)).join("\n");
    expect(issues).toMatch(/snippet-copy\.js/);
    expect(issues).toMatch(/answer/);
  });

  it("allows the shared snippet copy helper on docs pages", async () => {
    let html = fixture(goodHead).replace("</body>", '<script src="/snippet-copy.js" defer></script></body>');
    expect(await issuesFor(html)).toEqual([]);
  });

  it("allows the live benchmark script only on the acceleration page", async () => {
    let html = fixture(goodHead).replace(
      "</body>",
      '<script src="/snippet-copy.js" defer></script><script type="module" src="/assets/live-benchmark-test.js"></script></body>',
    );
    expect((await issuesFor(html)).join("\n")).toMatch(/snippet-copy\.js/);
    expect(allowedDocsScript("/docs/accel/", "/assets/live-benchmark-CHyM3o7G.js")).toBe(true);
    expect(allowedDocsScript("/docs/zod/", "/assets/live-benchmark-CHyM3o7G.js")).toBe(false);
  });

  it("accepts only an https origin for SITE_URL", () => {
    expect(resolveSiteUrl(undefined)).toBe("https://preview.invalid");
    expect(() => resolveSiteUrl("http://example.com")).toThrow(/https/);
    expect(() => resolveSiteUrl("https://example.com/docs")).toThrow(/origin/);
  });
});
