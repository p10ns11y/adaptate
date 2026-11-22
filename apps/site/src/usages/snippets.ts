import agUiSource from "./ag-ui.ts?raw";
import effectSource from "./effect.ts?raw";
import nodeStreamSource from "./node-stream.ts?raw";
import openApiSource from "./openapi.ts?raw";
import reactViewSource from "./react-view.tsx?raw";
import sseSource from "./sse.ts?raw";
import tanstackSource from "./tanstack.ts?raw";
import webReadableSource from "./web-readable.ts?raw";
import zodSource from "./zod.ts?raw";

export type UsageSnippet = {
  id: string;
  title: string;
  fileName: string;
  source: string;
};

export let usageSnippets: UsageSnippet[] = [
  { id: "react-view", title: "React", fileName: "react-view.tsx", source: reactViewSource },
  { id: "zod", title: "Zod", fileName: "zod.ts", source: zodSource },
  { id: "ag-ui", title: "AG-UI", fileName: "ag-ui.ts", source: agUiSource },
  { id: "openapi", title: "OpenAPI", fileName: "openapi.ts", source: openApiSource },
  { id: "effect", title: "Effect", fileName: "effect.ts", source: effectSource },
  { id: "web-readable", title: "ReadableStream", fileName: "web-readable.ts", source: webReadableSource },
  { id: "sse", title: "SSE", fileName: "sse.ts", source: sseSource },
  { id: "node-stream", title: "Node stream", fileName: "node-stream.ts", source: nodeStreamSource },
  { id: "tanstack", title: "TanStack AI", fileName: "tanstack.ts", source: tanstackSource },
];
