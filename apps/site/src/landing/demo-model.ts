import { openAPISchemaToZod } from "@adaptate/utils";

import { typePreview, zodSource } from "./zod-print.ts";

export let maxInputBytes = 32 * 1024;
export let maxDepth = 64;

export type Issue = { path: string; message: string };

export type DemoResult =
  | { kind: "valid" }
  | { kind: "invalid"; issues: Issue[] }
  | { kind: "waiting"; message: string };

export type DemoOutput = {
  schemaError: string | null;
  notes: string[];
  schemaNames: string[];
  picked: string | null;
  zod: string;
  type: string;
  result: DemoResult;
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

let schemaKeys = ["type", "properties", "items", "enum", "allOf", "anyOf", "oneOf", "$ref", "const", "format", "nullable"];

let isObject = (value: Json | undefined): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

function parseJson(text: string, label: string): { value: Json } | { error: string } {
  let bytes = new TextEncoder().encode(text).length;
  if (bytes > maxInputBytes) return { error: `${label} is ${(bytes / 1024).toFixed(1)} KB. The playground reads up to 32 KB.` };
  if (text.trim() === "") return { error: `${label} is empty.` };
  try {
    return { value: JSON.parse(text) as Json };
  } catch (error) {
    let detail = error instanceof Error ? error.message : String(error);
    return { error: `${label} is not valid JSON (${detail}). The playground reads JSON only, not YAML.` };
  }
}

function depthOf(value: Json): number {
  let deepest = 0;
  let stack: Array<[Json, number]> = [[value, 1]];
  while (stack.length > 0) {
    let [node, depth] = stack.pop() as [Json, number];
    if (typeof node !== "object" || node === null) continue;
    deepest = Math.max(deepest, depth);
    if (deepest > maxDepth) return deepest;
    for (let child of Object.values(node)) stack.push([child, depth + 1]);
  }
  return deepest;
}

function pointer(root: Json, ref: string): Json | undefined {
  let node: Json | undefined = root;
  for (let raw of ref.slice(2).split("/")) {
    let key = decodeURIComponent(raw).replaceAll("~1", "/").replaceAll("~0", "~");
    node = isObject(node) ? node[key] : Array.isArray(node) ? node[Number(key)] : undefined;
    if (node === undefined) return undefined;
  }
  return node;
}

let maxNodes = 20_000;

function resolveLocalRefs(node: Json, root: Json, notes: Set<string>, budget: { nodes: number }, seen: string[] = []): Json {
  budget.nodes += 1;
  if (budget.nodes > maxNodes) throw new RangeError("The schema expands past 20,000 nodes once $refs are resolved.");
  if (Array.isArray(node)) return node.map((child) => resolveLocalRefs(child, root, notes, budget, seen));
  if (!isObject(node)) return node;
  let ref = node.$ref;
  if (typeof ref === "string") {
    if (!ref.startsWith("#/")) {
      notes.add(`$ref ${ref} is not followed here, so it accepts any value.`);
      return {};
    }
    if (seen.includes(ref) || seen.length >= 16) {
      notes.add(`$ref ${ref} repeats inside itself; this page stops there and accepts any value.`);
      return {};
    }
    let target = pointer(root, ref);
    if (target === undefined) {
      notes.add(`$ref ${ref} points nowhere in this document, so it accepts any value.`);
      return {};
    }
    notes.add(`This page resolved $ref ${ref} before the call.`);
    return resolveLocalRefs(target, root, notes, budget, [...seen, ref]);
  }
  return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, resolveLocalRefs(child, root, notes, budget, seen)]));
}

function validationIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): Issue[] {
  return error.issues.slice(0, 8).map((issue) => ({
    path: issue.path.length === 0 ? "(root)" : issue.path.map(String).join("."),
    message: issue.message,
  }));
}

let empty = (schemaError: string, notes: string[] = []): DemoOutput => ({
  schemaError,
  notes,
  schemaNames: [],
  picked: null,
  zod: "",
  type: "",
  result: { kind: "waiting", message: "Fix the schema to check the payload." },
});

export function runDemo(schemaText: string, payloadText: string, pick?: string): DemoOutput {
  let parsed = parseJson(schemaText, "The schema");
  if ("error" in parsed) return empty(parsed.error);
  let document = parsed.value;
  if (depthOf(document) > maxDepth) return empty(`The schema nests deeper than ${maxDepth} levels. The playground stops there.`);
  if (!isObject(document)) {
    return empty("That is a JSON value, not a schema. Paste a JSON Schema or OpenAPI snippet here, and put values in the payload box.");
  }
  let notes = new Set<string>();
  let schemaNames: string[] = [];
  let picked: string | null = null;
  let root: Json = document;
  let components = isObject(document.components) ? document.components.schemas : undefined;
  if (isObject(components) && ("openapi" in document || "swagger" in document || !schemaKeys.some((key) => key in document))) {
    schemaNames = Object.keys(components).filter((name) => isObject(components[name]));
    if (schemaNames.length === 0) return empty("components.schemas has no schema objects.");
    let referenced = new Set([...JSON.stringify(components).matchAll(/"#\/components\/schemas\/([^"/]+)"/g)].map((match) => match[1]));
    let rootName = schemaNames.find((name) => !referenced.has(name)) ?? schemaNames[0] ?? null;
    picked = pick && schemaNames.includes(pick) ? pick : rootName;
    root = picked ? (components[picked] ?? {}) : {};
    notes.add(`This page picked components.schemas.${picked} from the document.`);
  } else if (!schemaKeys.some((key) => key in document)) {
    return empty("That looks like a JSON value, not a schema. Paste a JSON Schema or OpenAPI snippet here, and put values in the payload box.");
  }
  let schema;
  try {
    schema = openAPISchemaToZod(resolveLocalRefs(root, document, notes, { nodes: 0 }));
  } catch (error) {
    return empty(`This schema could not be converted: ${error instanceof Error ? error.message : String(error)}`, [...notes]);
  }
  let output: DemoOutput = {
    schemaError: null,
    notes: [...notes],
    schemaNames,
    picked,
    zod: zodSource(schema),
    type: typePreview(schema),
    result: { kind: "valid" },
  };
  let payload = parseJson(payloadText, "The payload");
  if ("error" in payload) {
    output.result = { kind: "waiting", message: payload.error };
    return output;
  }
  let checked = schema.safeParse(payload.value);
  output.result = checked.success ? { kind: "valid" } : { kind: "invalid", issues: validationIssues(checked.error) };
  return output;
}
