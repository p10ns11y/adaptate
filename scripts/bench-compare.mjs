import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [baseRoot, headRoot, limitArg] = process.argv.slice(2);
const limit = Number(limitArg ?? "1.05");
const rounds = 21;
const budgetMs = 60;

async function load(root) {
  const dir = resolve(root, "packages/core/build");
  const core = await import(pathToFileURL(resolve(dir, "index.es.js")).href);
  const stream = await import(
    pathToFileURL(resolve(dir, "stream.es.js")).href
  ).catch(() => ({}));
  const zod = await import(
    pathToFileURL(resolve(root, "packages/core/node_modules/zod/index.js")).href
  );
  return { ...core, ...stream, fixtures: fixtures(zod.z) };
}

function fixtures(z) {
  const schema = z.object({
    title: z.string().optional(),
    count: z.number().optional(),
    meta: z
      .object({
        owner: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
      .optional(),
    items: z
      .array(
        z.object({ name: z.string().optional(), qty: z.number().optional() }),
      )
      .optional(),
  });
  const config = {
    title: true,
    meta: { owner: true },
    items: { "*": { name: true, qty: true } },
  };
  const final = {
    title: "Weekly plan",
    count: 12,
    meta: { owner: "ada", tags: ["a", "b", "c"] },
    items: Array.from({ length: 20 }, (_, i) => ({
      name: `item-${i}`,
      qty: i,
    })),
  };
  const text = JSON.stringify(final);
  const half = JSON.parse(JSON.stringify(final));
  half.items = half.items.slice(0, 10);
  delete half.count;
  let deepSchema = z.object({ leaf: z.string() });
  let deepConfig = { leaf: true };
  for (let level = 0; level < 200; level += 1) {
    deepSchema = z.object({ nested: deepSchema });
    deepConfig = { nested: deepConfig };
  }
  return { schema, config, final, text, half, deepSchema, deepConfig };
}

const cases = {
  transformSchema: (m) =>
    m.transformSchema &&
    (() =>
      m
        .transformSchema(m.fixtures.schema, m.fixtures.config)
        .safeParse(m.fixtures.final)),
  transformPartialSchema: (m) =>
    m.transformPartialSchema &&
    (() =>
      m
        .transformPartialSchema(
          m.fixtures.schema,
          m.fixtures.config,
        )(m.fixtures.half)
        .safeParse(m.fixtures.half)),
  parsePartialJson: (m) =>
    m.parsePartialJson &&
    (() =>
      m.parsePartialJson(m.fixtures.text.slice(0, m.fixtures.text.length - 7))),
  agUiStream: (m) =>
    m.createAgUiPartialValidator &&
    (() => {
      const { schema, config, text } = m.fixtures;
      const push = m.createAgUiPartialValidator(schema, { card: config });
      for (let i = 0; i < text.length; i += 40)
        push({
          type: "TOOL_CALL_ARGS",
          toolCallId: "t",
          delta: text.slice(i, i + 40),
        });
    }),
  deepTransform: (m) =>
    m.transformSchema &&
    (() => m.transformSchema(m.fixtures.deepSchema, m.fixtures.deepConfig)),
};

function nsPerOp(fn) {
  let ops = 0;
  const start = process.hrtime.bigint();
  const stop = start + BigInt(budgetMs * 1e6);
  let now = start;
  while (now < stop) {
    fn();
    ops += 1;
    now = process.hrtime.bigint();
  }
  return Number(now - start) / ops;
}

const median = (values) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

const base = await load(baseRoot);
const head = await load(headRoot);
let failed = false;
const rows = [];
for (const [name, make] of Object.entries(cases)) {
  const baseFn = make(base);
  const headFn = make(head);
  if (!headFn) continue;
  if (!baseFn) {
    rows.push({
      case: name,
      base: "n/a",
      head: median(
        Array.from({ length: rounds }, () => nsPerOp(headFn)),
      ).toFixed(0),
      ratio: "new",
    });
    continue;
  }
  const measure = () => {
    nsPerOp(baseFn);
    nsPerOp(headFn);
    const baseRuns = [];
    const headRuns = [];
    for (let round = 0; round < rounds; round += 1) {
      const pair = round % 2 ? [baseFn, headFn] : [headFn, baseFn];
      const first = nsPerOp(pair[0]);
      const second = nsPerOp(pair[1]);
      (pair[0] === baseFn ? baseRuns : headRuns).push(first);
      (pair[1] === baseFn ? baseRuns : headRuns).push(second);
    }
    return { base: median(baseRuns), head: median(headRuns) };
  };
  let result = measure();
  for (
    let attempt = 0;
    attempt < 2 && result.head / result.base > limit;
    attempt += 1
  ) {
    result = measure();
  }
  const ratio = result.head / result.base;
  if (ratio > limit) failed = true;
  rows.push({
    case: name,
    base: result.base.toFixed(0),
    head: result.head.toFixed(0),
    ratio: ratio.toFixed(3),
  });
}
console.table(rows);
console.log(
  failed
    ? `FAIL: a case is more than ${((limit - 1) * 100).toFixed(0)}% slower`
    : "PASS",
);
process.exit(failed ? 1 : 0);
