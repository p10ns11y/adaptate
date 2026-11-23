---
title: "Find your choke points"
description: "Guard the few places where bad or partial data breaks an app, with a Result that keeps an ok track and an error track."
answer: "A choke point is a boundary where untrusted data enters: an API or SI model response, a stream, a form, an import, a config file. parse from @adaptate/core/result returns ok or err, so map, flatMap, and recover keep each track explicit. parseStream does the same for streamed JSON."
faq:
  - question: "Which schemas does parse accept?"
    answer: "Any Standard Schema: Zod, Valibot, ArkType, or a schema from openAPISchemaToZod in @adaptate/utils. Use parseAsync for schemas that validate asynchronously."
  - question: "What is on the error track?"
    answer: "The Standard Schema issues, each with a message and a path. mapError turns them into your own error type."
  - question: "How does parseStream fit the incremental parser?"
    answer: "It reads chunks through fromAsyncIterableSteps from @adaptate/core/stream-incremental and checks each partial value against an optional partial schema. The last step checks the closed value against the full schema, or errs when the stream stops before the value closes."
---

# Find your choke points

Most of an app trusts data that one small boundary already checked. Find those boundaries and give each one two tracks.

```mermaid
flowchart LR
  Input["untrusted input or stream"] --> Parse["parse or parseStream"]
  Parse -->|"ok"| Value["typed value"]
  Parse -->|"err"| Issues["issues"]
  Value -->|"map, flatMap"| Next["next step"]
  Issues -->|"recover, mapError"| Report["fallback or report"]
```

| Choke point | Schema source | Call |
| --- | --- | --- |
| API response | OpenAPI via `openAPISchemaToZod` | `parse` |
| SI tool call | Zod | `parseStream` |
| Form or import | Zod or JSON Schema | `parse` |
| Async refinement | any Standard Schema | `parseAsync` |

```ts
import { parse } from "@adaptate/core/result";

parse(schema, input).map(render).recover(showIssues);
```

The file below is typechecked and run by the site tests.

<!-- snippet: usages/choke-points.ts -->
```ts
import { parse, parseStream, type Issues } from "@adaptate/core/result";
import { openAPISchemaToZod } from "@adaptate/utils";
import { z } from "zod";

export let invoiceSchema = openAPISchemaToZod({
  type: "object",
  required: ["id", "total"],
  properties: {
    id: { type: "string", minLength: 1 },
    total: { type: "number", minimum: 0 },
  },
});

function fields(issues: Issues): string {
  return issues
    .map((issue) => {
      let first = issue.path?.[0];
      return String(typeof first === "object" ? first.key : (first ?? "input"));
    })
    .join(", ");
}

export function checkInvoice(input: unknown): string {
  return parse(invoiceSchema, input).match(
    () => "accepted",
    (issues) => `check ${fields(issues)}`,
  );
}

let toolArguments = z.object({ city: z.string(), days: z.number().int().positive() });

type Trip = { city: string; days: number; nights: number };
export type ToolCallOutcome = { previews: string[]; call?: Trip; issues?: string[] };

export async function readToolCall(chunks: AsyncIterable<string>): Promise<ToolCallOutcome> {
  let previews: string[] = [];
  let outcome: ToolCallOutcome = { previews };
  for await (let step of parseStream(chunks, toolArguments, toolArguments.partial())) {
    if (!step.done) {
      if (step.result.ok && step.result.value.city) previews.push(step.result.value.city);
      continue;
    }
    outcome = step.result
      .map((call) => ({ ...call, nights: call.days - 1 }))
      .match<ToolCallOutcome>(
        (call) => ({ previews, call }),
        (issues) => ({ previews, issues: issues.map((issue) => issue.message) }),
      );
  }
  return outcome;
}
```
<!-- /snippet -->
