import agUiSource from "./ag-ui.ts?raw";
import nodeStreamSource from "./node-stream.ts?raw";
import openApiSource from "./openapi.ts?raw";
import reactViewSource from "./react-view.tsx?raw";
import sseSource from "./sse.ts?raw";
import tanstackSource from "./tanstack.ts?raw";
import webReadableSource from "./web-readable.ts?raw";

export type UsageSnippet = {
  id: string;
  title: string;
  fileName: string;
  source: string;
};

export let usageSnippets: UsageSnippet[] = [
  {
    id: "react-view",
    title: "React view",
    fileName: "react-view.tsx",
    source: reactViewSource,
  },
  {
    id: "openapi",
    title: "OpenAPI",
    fileName: "openapi.ts",
    source: openApiSource,
  },
  {
    id: "ag-ui",
    title: "AG-UI",
    fileName: "ag-ui.ts",
    source: agUiSource,
  },
  {
    id: "node-stream",
    title: "Node stream",
    fileName: "node-stream.ts",
    source: nodeStreamSource,
  },
  {
    id: "web-readable",
    title: "Web ReadableStream",
    fileName: "web-readable.ts",
    source: webReadableSource,
  },
  {
    id: "sse",
    title: "SSE",
    fileName: "sse.ts",
    source: sseSource,
  },
  {
    id: "tanstack",
    title: "TanStack AI stream",
    fileName: "tanstack.ts",
    source: tanstackSource,
  },
];
