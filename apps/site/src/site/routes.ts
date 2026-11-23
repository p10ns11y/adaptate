import { landingCopy } from "./landing-copy.ts";

export type FaqEntry = { question: string; answer: string };

export type RouteKind = "landing" | "load" | "guide" | "api" | "journey";

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
  title: "adaptate: typed, validated data from any schema or stream",
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
    "This page streams a seeded tool-call load through the adaptate stream parsers in your browser for about 60 seconds and reports throughput and cost per chunk. Nothing leaves the page.",
  faq: [],
};


export let journeyRoute: SiteRoute = {
  path: "/journey/",
  kind: "journey",
  title: "The adaptate journey",
  heading: "The adaptate journey",
  description:
    "Public git and npm history of adaptate: a rebuild from recursion and mutual recursion, first published in 2024, then CI, OIDC, streaming, and 2.4.",
  answer:
    "The problem started at Oneflow, where entity schemas did not match across endpoints while I was building features. I wrote the precursor by hand, alone. I wanted to open-source it back then; it didn't happen. After I lost access to the code (nothing secret was kept), I rebuilt adaptate from general programming concepts — recursion and mutual recursion. No Oneflow code is in adaptate.",
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
