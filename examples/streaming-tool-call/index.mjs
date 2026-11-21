import { z } from "zod";
import { createAgUiPartialValidator } from "@adaptate/core/stream";

const cutOffArgs = '{"title":"Pas';

let parseThrew = false;
try {
  JSON.parse(cutOffArgs);
} catch (error) {
  if (!(error instanceof SyntaxError)) throw error;
  parseThrew = true;
}
if (!parseThrew) {
  throw new Error("JSON.parse accepted a cut-off tool call");
}

const push = createAgUiPartialValidator(
  z.object({ title: z.string(), servings: z.number() }),
  { card: { title: true } },
);
const check = push({
  type: "TOOL_CALL_ARGS",
  toolCallId: "call-1",
  delta: cutOffArgs,
});
const partial = check?.partial;
const title = partial !== null && typeof partial === "object" && "title" in partial ? partial.title : undefined;
if (title !== "Pas" || check?.results.card.valid !== true) {
  throw new Error("Adaptate did not mark the card ready for the cut-off title");
}

console.log("Without Adaptate: JSON.parse throws, so the card stays blank.");
console.log("With Adaptate:", partial, "card ready:", check.results.card.valid);
