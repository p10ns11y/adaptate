import type { z } from "zod";

type Check = { check?: string; minimum?: number; maximum?: number; value?: number; inclusive?: boolean; format?: string; pattern?: RegExp };

type Def = {
  type: string;
  format?: string;
  checks?: Array<{ _zod: { def: Check } }>;
  innerType?: z.ZodType;
  element?: z.ZodType;
  options?: z.ZodType[];
  left?: z.ZodType;
  right?: z.ZodType;
  entries?: Record<string, string | number>;
  values?: unknown[];
  shape?: Record<string, z.ZodType>;
};

let defOf = (schema: z.ZodType) => schema._zod.def as unknown as Def;

let formats: Record<string, string> = {
  email: "z.email()",
  uuid: "z.uuid()",
  url: "z.url()",
  datetime: "z.iso.datetime()",
  date: "z.iso.date()",
  time: "z.iso.time()",
  ipv4: "z.ipv4()",
  ipv6: "z.ipv6()",
};

let identifier = /^[A-Za-z_$][\w$]*$/;
let keyText = (key: string) => (identifier.test(key) ? key : JSON.stringify(key));
let pad = (depth: number) => "  ".repeat(depth);

function checksText(def: Def): string {
  let text = "";
  for (let { _zod } of def.checks ?? []) {
    let check = _zod.def;
    if (check.check === "min_length") text += `.min(${check.minimum})`;
    else if (check.check === "max_length") text += `.max(${check.maximum})`;
    else if (check.check === "greater_than") text += check.inclusive ? `.min(${check.value})` : `.gt(${check.value})`;
    else if (check.check === "less_than") text += check.inclusive ? `.max(${check.value})` : `.lt(${check.value})`;
    else if (check.check === "number_format") text += check.format === "safeint" ? ".int()" : "";
    else if (check.check === "string_format" && check.format === "regex") text += `.regex(${String(check.pattern)})`;
    else text += ".refine(…)";
  }
  return text;
}

function unwrap(schema: z.ZodType): { inner: z.ZodType; optional: boolean; nullable: boolean } {
  let optional = false;
  let nullable = false;
  let inner = schema;
  for (;;) {
    let def = defOf(inner);
    if (def.type === "optional" && def.innerType) optional = true;
    else if (def.type === "nullable" && def.innerType) nullable = true;
    else return { inner, optional, nullable };
    inner = def.innerType;
  }
}

export function zodSource(schema: z.ZodType, depth = 0): string {
  let { inner, optional, nullable } = unwrap(schema);
  let suffix = `${nullable ? ".nullable()" : ""}${optional ? ".optional()" : ""}`;
  let def = defOf(inner);
  let body: string;
  if (def.type === "object" && def.shape) {
    let lines = Object.entries(def.shape).map(([key, value]) => `${pad(depth + 1)}${keyText(key)}: ${zodSource(value, depth + 1)},`);
    body = lines.length === 0 ? "z.object({})" : `z.object({\n${lines.join("\n")}\n${pad(depth)}})`;
  } else if (def.type === "string") {
    body = (def.format ? (formats[def.format] ?? `z.string() /* ${def.format} */`) : "z.string()") + checksText(def);
  } else if (def.type === "number") {
    body = `z.number()${checksText(def)}`;
  } else if (def.type === "boolean") {
    body = "z.boolean()";
  } else if (def.type === "array" && def.element) {
    body = `z.array(${zodSource(def.element, depth)})${checksText(def)}`;
  } else if (def.type === "enum" && def.entries) {
    body = `z.enum([${Object.values(def.entries).map((value) => JSON.stringify(value)).join(", ")}])`;
  } else if (def.type === "literal" && def.values) {
    body = `z.literal(${def.values.map((value) => JSON.stringify(value)).join(", ")})`;
  } else if (def.type === "union" && def.options) {
    body = `z.union([${def.options.map((option) => zodSource(option, depth)).join(", ")}])`;
  } else if (def.type === "intersection" && def.left && def.right) {
    body = `z.intersection(${zodSource(def.left, depth)}, ${zodSource(def.right, depth)})`;
  } else {
    body = `z.${def.type}()`;
  }
  return body + suffix;
}

export function typePreview(schema: z.ZodType, depth = 0, property = false): string {
  let { inner, optional, nullable } = unwrap(schema);
  let def = defOf(inner);
  let body: string;
  if (def.type === "object" && def.shape) {
    let lines = Object.entries(def.shape).map(([key, value]) => {
      let optional = unwrap(value).optional ? "?" : "";
      return `${pad(depth + 1)}${keyText(key)}${optional}: ${typePreview(value, depth + 1, true)};`;
    });
    body = lines.length === 0 ? "{}" : `{\n${lines.join("\n")}\n${pad(depth)}}`;
  } else if (def.type === "string" || def.type === "number" || def.type === "boolean") {
    body = def.type;
  } else if (def.type === "array" && def.element) {
    let element = typePreview(def.element, depth);
    body = /[|&]/.test(element) && !element.startsWith("{") ? `(${element})[]` : `${element}[]`;
  } else if (def.type === "enum" && def.entries) {
    body = Object.values(def.entries).map((value) => JSON.stringify(value)).join(" | ");
  } else if (def.type === "literal" && def.values) {
    body = def.values.map((value) => JSON.stringify(value)).join(" | ");
  } else if (def.type === "union" && def.options) {
    body = def.options.map((option) => typePreview(option, depth)).join(" | ");
  } else if (def.type === "intersection" && def.left && def.right) {
    body = `${typePreview(def.left, depth)} & ${typePreview(def.right, depth)}`;
  } else {
    body = def.type === "any" ? "any" : "unknown";
  }
  if (nullable) body = `${body} | null`;
  return optional && !property ? `${body} | undefined` : body;
}
