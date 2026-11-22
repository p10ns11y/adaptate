import { z as zod } from "zod";

import { createStreamValidator } from "@adaptate/core/stream";
import {
  createAgUiPartialValidator,
  createPartialJsonFeed,
} from "@adaptate/core/stream-incremental";

import { orderDocument, orderSchema, receiptConfig, toolCallDeltas } from "./order.js";
import { microsPerChunk } from "./loops.js";

const nowNs = () => Number(process.hrtime.bigint());
const budgetMs = 100;

function chunksOf(text, size) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function feedPass(text, size) {
  const chunks = chunksOf(text, size);
  let visits = 0;
  return {
    chunks,
    run() {
      const feed = createPartialJsonFeed();
      let value;
      for (const chunk of chunks) {
        visits += chunk.length;
        value = feed(chunk);
      }
      return value;
    },
  };
}

const grocery = toolCallDeltas(orderDocument);
const groceryFeed = feedPass(grocery.text, 24);
const groceryValue = groceryFeed.run();
if (JSON.stringify(groceryValue) !== JSON.stringify(orderDocument)) {
  throw new Error("grocery feed disagreed");
}

const leaf = "x".repeat(20_000);
const leafText = JSON.stringify({ leaf });
const leafFeed = feedPass(leafText, 8);
const leafValue = leafFeed.run();
if (leafValue?.leaf !== leaf) throw new Error("20 KB string disagreed");

const steps = Array.from({ length: 1000 }, (_item, index) => ({
  text: `step-${index}`,
  minutes: index % 30,
}));
const stepsDocument = { title: "Soup", servings: 2, steps };
const stepsText = JSON.stringify(stepsDocument);
const stepsFeed = feedPass(stepsText, 16);
const stepsValue = stepsFeed.run();
if (stepsValue?.steps?.length !== 1000) throw new Error("steps array disagreed");

const recipe = zod.object({
  title: zod.string(),
  servings: zod.number(),
  steps: zod.array(zod.object({ text: zod.string(), minutes: zod.number() })),
});
const validator = createStreamValidator(recipe, { card: { title: true } });
const stepsChunks = chunksOf(stepsText, 16);

const grocerySchema = orderSchema(zod, "partial");
const groceryPush = createAgUiPartialValidator(grocerySchema, {
  receipt: receiptConfig,
});
let groceryVisits = 0;
for (const delta of grocery.deltas) {
  groceryVisits += delta.length;
  groceryPush({ type: "TOOL_CALL_ARGS", toolCallId: "call_order", delta });
}
if (groceryVisits !== grocery.text.length) throw new Error("grocery visits");

const groceryMicros = microsPerChunk(
  () => {
    const push = createAgUiPartialValidator(grocerySchema, { receipt: receiptConfig });
    for (const delta of grocery.deltas) {
      push({ type: "TOOL_CALL_ARGS", toolCallId: "call_order", delta });
    }
  },
  grocery.deltas.length,
  budgetMs,
  nowNs,
);

const leafMicros = microsPerChunk(
  () => leafFeed.run(),
  leafFeed.chunks.length,
  budgetMs,
  nowNs,
);

const steppedValues = [];
{
  const feed = createPartialJsonFeed();
  for (const chunk of stepsChunks) steppedValues.push(feed(chunk));
}
const stepsParseMicros = microsPerChunk(
  () => {
    const feed = createPartialJsonFeed();
    for (const chunk of stepsChunks) feed(chunk);
  },
  stepsChunks.length,
  budgetMs,
  nowNs,
);
const stepsValidateMicros = microsPerChunk(
  () => {
    for (const value of steppedValues) {
      if (value !== undefined) validator.partial(value);
    }
  },
  stepsChunks.length,
  budgetMs,
  nowNs,
);

console.log(
  JSON.stringify({
    groceryUs: Number(groceryMicros.toFixed(3)),
    string20kUs: Number(leafMicros.toFixed(3)),
    stepsParseUs: Number(stepsParseMicros.toFixed(3)),
    stepsValidateUs: Number(stepsValidateMicros.toFixed(3)),
    groceryChunks: grocery.deltas.length,
    stringChunks: leafFeed.chunks.length,
    stepsChunks: stepsChunks.length,
  }),
);
