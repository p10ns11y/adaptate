import { z } from "zod";

import { type Config } from "./index.js";
import { type DeepPartial } from "./partial.js";
import { agUiValidatorWith } from "./stream.js";

const frameItems = 0;
const frameArray = 1;
const framePhase = 2;
const frameKey = 3;
const frameLink = 4;
const frameRevision = 5;
const frameCached = 6;
const frameCachedRevision = 7;
const phaseKey = 0;
const phaseColon = 1;
const phaseValue = 2;
const phaseComma = 3;

type Container = unknown[] | Record<string, unknown>;
type OpenFrame = [
  Container,
  boolean,
  number,
  string | undefined,
  string,
  number,
  Container | undefined,
  number,
];

type OpenString = {
  decoded: string;
  pending: string;
  next: number;
  broken: boolean;
  start: number;
};

const keywords = ["true", "false", "null"];
const numberGrammar = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const incompleteTail = /^(?:\.$|[eE][+-]?$)/;
const simpleEscapes = '"\\/bfnrt';
const simpleValues = '"\\/\b\f\n\r\t';

function defineOwn(container: Container, key: string, value: unknown): void {
  if (Array.isArray(container)) {
    container[Number(key)] = value;
    return;
  }
  Object.defineProperty(container, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function copyContainer(items: Container): Container {
  if (Array.isArray(items)) return items.slice();
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(items)) defineOwn(copy, key, items[key]);
  return copy;
}

function hexCode(hex: string): number | undefined {
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) return undefined;
  return Number.parseInt(hex, 16);
}

function literalEnd(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const character = source[index] as string;
    if (
      character === " " ||
      character === "\n" ||
      character === "\r" ||
      character === "\t" ||
      character === '"' ||
      character === "{" ||
      character === "}" ||
      character === "[" ||
      character === "]" ||
      character === ":" ||
      character === ","
    ) {
      break;
    }
    index += 1;
  }
  return index;
}

function readNumber(literal: string): { length: number; value: number } | undefined {
  if (literal === "-") return { length: 0, value: 0 };
  const matched = numberGrammar.exec(literal);
  if (!matched || matched.index !== 0) return undefined;
  const valid = matched[0];
  return { length: valid.length, value: Number(valid) };
}

function numberHolds(literal: string, validLength: number, atEnd: boolean): boolean {
  if (!atEnd) return false;
  if (validLength === 0) return literal === "-";
  const rest = literal.slice(validLength);
  return rest.length === 0 || incompleteTail.test(rest);
}

function keywordSpan(literal: string): number | undefined {
  const full = keywords.find((keyword) => literal.startsWith(keyword));
  if (full) return full.length;
  if (keywords.some((keyword) => keyword.startsWith(literal))) return 0;
  return undefined;
}

export type PartialJsonFeed = (chunk: string) => unknown;

export function createPartialJsonFeed(): PartialJsonFeed {
  let source = "";
  let cursor = 0;
  let sealed = false;
  let done = false;
  let rootValue: unknown;
  let cached: unknown;
  let hasCache = false;
  let holdingNumber = false;
  let heldNumber = 0;
  let openString: OpenString | undefined;
  let dirty = false;
  let tailStamp = 0;
  let publishedStamp = 0;
  const openFrames: OpenFrame[] = [];

  function currentFrame(): OpenFrame | undefined {
    return openFrames[openFrames.length - 1];
  }

  function closeFrame(): void {
    openFrames.pop();
    const parent = currentFrame();
    if (!parent) {
      done = true;
      dirty = true;
      return;
    }
    parent[framePhase] = phaseComma;
    dirty = true;
  }

  function commitScalar(value: unknown): void {
    const frame = currentFrame();
    if (!frame) {
      rootValue = value;
      done = true;
      dirty = true;
      return;
    }
    const items = frame[frameItems];
    if (frame[frameArray]) defineOwn(items, String((items as unknown[]).length), value);
    else {
      defineOwn(items, frame[frameKey] as string, value);
      frame[frameKey] = undefined;
    }
    frame[framePhase] = phaseComma;
    frame[frameRevision] += 1;
    dirty = true;
  }

  function openContainer(isArray: boolean): void {
    const items: Container = isArray ? [] : {};
    const parent = currentFrame();
    let link = "";
    if (!parent) {
      rootValue = items;
    } else if (parent[frameArray]) {
      link = String((parent[frameItems] as unknown[]).length);
      defineOwn(parent[frameItems], link, items);
      parent[frameRevision] += 1;
    } else {
      link = parent[frameKey] as string;
      defineOwn(parent[frameItems], link, items);
      parent[frameKey] = undefined;
      parent[frameRevision] += 1;
    }
    openFrames.push([
      items,
      isArray,
      isArray ? phaseValue : phaseKey,
      undefined,
      link,
      0,
      undefined,
      -1,
    ]);
    dirty = true;
  }

  function acceptStructural(token: string): boolean {
    if (done) return false;
    const frame = currentFrame();
    if (token === "{" || token === "[") {
      if (frame && !frame[frameArray] && frame[framePhase] === phaseKey) return false;
      if (frame && frame[framePhase] === phaseColon) return false;
      if (frame && frame[framePhase] === phaseComma) return false;
      openContainer(token === "[");
      return true;
    }
    if (token === "}" || token === "]") {
      if (!frame) return false;
      const closesArray = token === "]";
      if (closesArray !== frame[frameArray]) return false;
      if (frame[framePhase] === phaseColon) return false;
      if (!closesArray && frame[framePhase] === phaseValue) return false;
      closeFrame();
      return true;
    }
    if (token === ":") {
      if (!frame || frame[framePhase] !== phaseColon) return false;
      frame[framePhase] = phaseValue;
      return true;
    }
    if (!frame || frame[framePhase] !== phaseComma) return false;
    frame[framePhase] = frame[frameArray] ? phaseValue : phaseKey;
    return true;
  }

  function acceptValue(value: unknown, quoted: boolean): boolean {
    if (done) return false;
    const frame = currentFrame();
    if (!frame) {
      commitScalar(value);
      return true;
    }
    if (frame[framePhase] === phaseKey && quoted && typeof value === "string") {
      frame[frameKey] = value;
      frame[framePhase] = phaseColon;
      return true;
    }
    if (frame[framePhase] === phaseValue) {
      commitScalar(value);
      return true;
    }
    return false;
  }

  function expectsValue(): boolean {
    if (done) return false;
    const frame = currentFrame();
    if (!frame) return true;
    return frame[framePhase] === phaseValue;
  }

  function feedOpenString(open: OpenString): "open" | "closed" | "bad" {
    let added = "";
    let pending = open.pending;
    let index = open.next;
    let broken = open.broken;
    while (index < source.length) {
      const character = source[index] as string;
      if (pending.length > 0) {
        pending += character;
        index += 1;
        if (pending[1] === "u") {
          if (pending.length < 6) continue;
          const code = hexCode(pending.slice(2));
          if (code === undefined) broken = true;
          else if (!broken) added += String.fromCharCode(code);
          pending = "";
          continue;
        }
        const found = simpleEscapes.indexOf(pending[1] as string);
        if (found < 0) broken = true;
        else if (!broken) added += simpleValues[found] as string;
        pending = "";
        continue;
      }
      if (character === '"') {
        if (added.length > 0) {
          open.decoded += added;
          if (expectsValue()) tailStamp += 1;
        }
        open.pending = "";
        open.next = index + 1;
        open.broken = broken;
        return broken ? "bad" : "closed";
      }
      if (character === "\\") {
        pending = "\\";
        index += 1;
        continue;
      }
      if (character < " ") {
        broken = true;
        index += 1;
        continue;
      }
      if (!broken) added += character;
      index += 1;
    }
    if (added.length > 0) {
      open.decoded += added;
      if (expectsValue()) tailStamp += 1;
    }
    open.pending = pending;
    open.next = index;
    open.broken = broken;
    return "open";
  }

  function partialTail(): { include: boolean; value: unknown } {
    if (!expectsValue()) return { include: false, value: undefined };
    if (openString) return { include: true, value: openString.decoded };
    if (holdingNumber) return { include: true, value: heldNumber };
    return { include: false, value: undefined };
  }

  function snapshot(): unknown {
    const partial = partialTail();
    if (openFrames.length === 0) {
      if (partial.include) return partial.value;
      return rootValue;
    }
    let childCopy: Container | undefined;
    let childLink: string | undefined;
    for (let index = openFrames.length - 1; index >= 0; index -= 1) {
      const frame = openFrames[index] as OpenFrame;
      const deepest = index === openFrames.length - 1;
      const cachedCopy = frame[frameCached];
      const structureSame =
        cachedCopy !== undefined && frame[frameRevision] === frame[frameCachedRevision];
      if (!deepest && structureSame) {
        const target = copyContainer(cachedCopy);
        defineOwn(target, childLink as string, childCopy);
        frame[frameCached] = target;
        frame[frameCachedRevision] = frame[frameRevision];
        childCopy = target;
        childLink = frame[frameLink];
        continue;
      }
      const copy = copyContainer(frame[frameItems]);
      if (childCopy !== undefined) defineOwn(copy, childLink as string, childCopy);
      if (deepest && partial.include) {
        if (frame[frameArray]) (copy as unknown[]).push(partial.value);
        else defineOwn(copy, frame[frameKey] as string, partial.value);
      }
      frame[frameCached] = copy;
      frame[frameCachedRevision] = frame[frameRevision];
      childCopy = copy;
      childLink = frame[frameLink];
    }
    return childCopy;
  }

  return function push(chunk: string) {
    if (sealed) return cached;
    if (chunk.length === 0 && hasCache) return cached;
    const heldBefore = holdingNumber;
    const heldValueBefore = heldNumber;
    source += chunk;
    while (cursor < source.length && !sealed) {
      if (openString) {
        const outcome = feedOpenString(openString);
        if (outcome === "open") break;
        const value = openString.decoded;
        const start = openString.start;
        const bad = outcome === "bad";
        cursor = openString.next;
        openString = undefined;
        if (!acceptValue(value, true)) {
          cursor = start;
          sealed = true;
          break;
        }
        if (bad) {
          sealed = true;
          break;
        }
        continue;
      }
      const character = source[cursor] as string;
      if (
        character === " " ||
        character === "\n" ||
        character === "\r" ||
        character === "\t"
      ) {
        cursor += 1;
        continue;
      }
      if (character === '"') {
        if (expectsValue()) tailStamp += 1;
        openString = { decoded: "", pending: "", next: cursor + 1, broken: false, start: cursor };
        continue;
      }
      if (
        character === "{" ||
        character === "}" ||
        character === "[" ||
        character === "]" ||
        character === ":" ||
        character === ","
      ) {
        if (!acceptStructural(character)) {
          sealed = true;
          break;
        }
        cursor += 1;
        continue;
      }
      const end = literalEnd(source, cursor);
      const literal = source.slice(cursor, end);
      const atEnd = end === source.length;
      const number = readNumber(literal);
      if (number && (number.length > 0 || literal === "-")) {
        if (numberHolds(literal, number.length, atEnd)) {
          if (number.length > 0) {
            holdingNumber = true;
            heldNumber = number.value;
          }
          break;
        }
        if (number.length === 0) {
          sealed = true;
          break;
        }
        holdingNumber = false;
        cursor += number.length;
        if (!acceptValue(number.value, false)) {
          cursor -= number.length;
          sealed = true;
          break;
        }
        continue;
      }
      const keyword = keywordSpan(literal);
      if (keyword === 0) {
        if (atEnd) break;
        sealed = true;
        break;
      }
      if (keyword !== undefined) {
        const word = literal.slice(0, keyword);
        const value = word === "true" ? true : word === "false" ? false : null;
        holdingNumber = false;
        cursor += keyword;
        if (!acceptValue(value, false)) {
          cursor -= keyword;
          sealed = true;
          break;
        }
        continue;
      }
      sealed = true;
      break;
    }
    if (tailStamp !== publishedStamp) dirty = true;
    if (holdingNumber !== heldBefore || (holdingNumber && !Object.is(heldNumber, heldValueBefore))) {
      dirty = true;
    }
    if (!dirty && hasCache) return cached;
    if (!dirty) {
      hasCache = true;
      cached = undefined;
      return undefined;
    }
    dirty = false;
    publishedStamp = tailStamp;
    cached = snapshot();
    hasCache = true;
    return cached;
  };
}

export async function* fromAsyncIterable(
  source: AsyncIterable<string | Uint8Array>,
): AsyncGenerator<unknown> {
  const pushChunk = createPartialJsonFeed();
  const decoder = new TextDecoder();
  for await (const sourceChunk of source) {
    const text =
      typeof sourceChunk === "string"
        ? sourceChunk
        : decoder.decode(sourceChunk, { stream: true });
    if (text.length === 0) continue;
    const partialValue = pushChunk(text);
    if (partialValue !== undefined) yield partialValue;
  }
  const flushedText = decoder.decode();
  if (flushedText.length === 0) return;
  const partialValue = pushChunk(flushedText);
  if (partialValue !== undefined) yield partialValue;
}

export function createAgUiPartialValidator<
  TSchema extends z.ZodType,
  TConfigs extends Record<string, Config<DeepPartial<z.infer<TSchema>>>>,
>(schema: TSchema, configs: TConfigs) {
  return agUiValidatorWith(schema, configs, createPartialJsonFeed);
}
