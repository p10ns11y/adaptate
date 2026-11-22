import { landingCopy } from "./landing-copy.ts";

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
  title: "adaptate: typed, validated data from your schema",
  heading: landingCopy.heading,
  description: landingCopy.answer,
  answer: landingCopy.answer,
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
