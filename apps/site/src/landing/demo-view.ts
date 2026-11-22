import type { DemoOutput } from "./demo-model.ts";

export type ResultParts = { tone: "pass" | "fail" | "wait"; title: string; lines: string[] };

export function resultParts(output: DemoOutput): ResultParts {
  let result = output.result;
  if (result.kind === "valid") return { tone: "pass", title: "Valid", lines: ["safeParse accepted this payload."] };
  if (result.kind === "waiting") return { tone: "wait", title: "Waiting", lines: [result.message] };
  let count = result.issues.length;
  return {
    tone: "fail",
    title: `${count} issue${count === 1 ? "" : "s"}`,
    lines: result.issues.map((issue) => `${issue.path}: ${issue.message}`),
  };
}

export function statusLines(output: DemoOutput): { error: boolean; lines: string[] } {
  if (output.schemaError) return { error: true, lines: [output.schemaError, ...output.notes] };
  return { error: false, lines: output.notes.length > 0 ? output.notes : ["Converted in this tab. Nothing is sent anywhere."] };
}
