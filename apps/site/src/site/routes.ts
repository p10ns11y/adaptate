export type FaqEntry = { question: string; answer: string };

export type RouteKind = "landing" | "load" | "guide" | "api";

export type SiteRoute = {
  path: string;
  kind: RouteKind;
  title: string;
  heading: string;
  description: string;
  answer: string;
  faq: FaqEntry[];
};

export let landingRoute: SiteRoute = {
  path: "/",
  kind: "landing",
  title: "adaptate: one Zod schema, a check per view",
  heading: "One schema. Each part of the app checks only the fields it uses.",
  description:
    "adaptate turns one Zod schema into a check per view, and checks a JSON tool call while it is still arriving. TypeScript, MIT, OpenAPI in and out.",
  answer:
    "adaptate turns one Zod schema into a check per view. A card can require the title while a kitchen screen also requires servings. The same check runs on a JSON tool call that is still arriving.",
  faq: [],
};

export let loadRoute: SiteRoute = {
  path: "/load/",
  kind: "load",
  title: "Live load test · adaptate",
  heading: "Live load test",
  description:
    "A browser-only load test that streams large, deeply nested JSON through the adaptate incremental parser and reports chunks per second and depth.",
  answer:
    "This page will stream large, deeply nested JSON through @adaptate/core/stream-incremental in a Web Worker and report chunks per second, MB per second, and depth. It is not live yet.",
  faq: [],
};

export let staticRoutes: SiteRoute[] = [landingRoute, loadRoute];

export function descriptionFrom(answer: string): string {
  let plain = answer.replace(/\s+/g, " ").trim();
  if (plain.length <= 160) return plain;
  let cut = plain.slice(0, 159);
  let space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 50 ? space : 159).replace(/[,;:.]$/, "")}…`;
}
