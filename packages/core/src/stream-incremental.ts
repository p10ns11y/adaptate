import { z } from "zod";

import { withFrontier, type JsonPath } from "./frontier.js";
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

type Scalar = { length: number; value: unknown; numeric: boolean };

function readScalar(literal: string): Scalar | undefined {
  const keyword = keywords.find((word) => literal.startsWith(word));
  if (keyword !== undefined) {
    let value = keyword === "true" ? true : keyword === "false" ? false : null;
    return { length: keyword.length, value, numeric: false };
  }
  const matched = numberGrammar.exec(literal);
  if (!matched) return undefined;
  return { length: matched[0].length, value: Number(matched[0]), numeric: true };
}

// `-` and `tru` may still grow into a scalar, but have no value yet.
function scalarPrefix(literal: string): boolean {
  return literal === "-" || keywords.some((word) => word.startsWith(literal));
}

// A scalar that reaches the end of the buffer may still grow: `tru` + `e`, `1` + `2`, `1.` + `5`.
function scalarHolds(literal: string, scalar: Scalar, atEnd: boolean): boolean {
  if (!atEnd) return false;
  const rest = literal.slice(scalar.length);
  return rest.length === 0 || (scalar.numeric && incompleteTail.test(rest));
}

function closesScalar(character: string): boolean {
  return " \n\r\t,}]".includes(character);
}

export type PartialJsonFeed = (chunk: string) => unknown;

export type { JsonPath };

export type JsonStreamStep = {
  readonly value: unknown;
  readonly complete: boolean;
  /**
   * Keys from the root to the deepest open value. A value off `openPath` is final
   * unless the document repeats a key on that path later (`JSON.parse` lets the last duplicate win).
   */
  readonly openPath?: JsonPath;
  /** True while the last value on `openPath` is a cut-off string, number or keyword. */
  readonly tailOpen?: boolean;
};

function hasPath(root: unknown, path: JsonPath): boolean {
  let cursor = root;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null) return false;
    if (Array.isArray(cursor)) {
      if (!Number.isInteger(key) || (key as number) < 0) return false;
      if ((key as number) >= cursor.length) return false;
    } else if (typeof key !== "string" || !Object.hasOwn(cursor, key))
      return false;
    cursor = (cursor as Record<string | number, unknown>)[key];
  }
  return true;
}

/**
 * True when `path` holds a value that later steps will not change, unless the document repeats a key on that path.
 *
 * Array steps take integer index keys and object steps take string keys, as in `openPath`.
 * A value off `openPath` is final unless the document repeats a key on that path later
 * (`JSON.parse` lets the last duplicate win). A partial step whose partial schema
 * fails has no `result.value`, so no path on it is settled.
 */
export function isSettled(
  step:
    | JsonStreamStep
    | {
        readonly done: boolean;
        readonly result: { readonly ok: boolean; readonly value?: unknown };
        readonly openPath?: JsonPath;
      },
  path: JsonPath,
): boolean {
  if ("result" in step) {
    if (!step.result.ok || !hasPath(step.result.value, path)) return false;
    if (step.done) return true;
  } else {
    if (!hasPath(step.value, path)) return false;
    if (step.complete) return true;
  }
  const openPath = step.openPath;
  if (!openPath) return false;
  return !path.every((key, index) => openPath[index] === key);
}

const jsonNumber = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export type TrackedFeed = {
  readonly push: PartialJsonFeed;
  readonly complete: () => boolean;
  readonly ended: () => boolean;
  readonly openPath: () => JsonPath;
  readonly tailOpen: () => boolean;
};

export function createTrackedFeed(): TrackedFeed {
  let source = "";
  let cursor = 0;
  let sealed = false;
  let done = false;
  let lastWasComma = false;
  let trailingComma = false;
  let rootValue: unknown;
  let cached: unknown;
  let hasCache = false;
  let holdingScalar = false;
  let heldScalar: unknown;
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
    if (frame[frameArray])
      defineOwn(items, String((items as unknown[]).length), value);
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
    const afterComma = lastWasComma;
    lastWasComma = false;
    if (done) return false;
    const frame = currentFrame();
    if (token === "{" || token === "[") {
      if (frame && !frame[frameArray] && frame[framePhase] === phaseKey)
        return false;
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
      if (afterComma) trailingComma = true;
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
    lastWasComma = true;
    return true;
  }

  function acceptValue(value: unknown, quoted: boolean): boolean {
    lastWasComma = false;
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
    if (holdingScalar) return { include: true, value: heldScalar };
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
        cachedCopy !== undefined &&
        frame[frameRevision] === frame[frameCachedRevision];
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
      if (childCopy !== undefined)
        defineOwn(copy, childLink as string, childCopy);
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

  const push = (chunk: string): unknown => {
    if (sealed) return cached;
    if (chunk.length === 0 && hasCache) return cached;
    const heldBefore = holdingScalar;
    const heldValueBefore = heldScalar;
    source += chunk;
    while (cursor < source.length && !sealed) {
      if (openString) {
        const outcome = feedOpenString(openString);
        if (outcome === "open") break;
        // A bad string stays the open tail: it is never committed, so it never reads as settled.
        if (outcome === "bad") {
          sealed = true;
          break;
        }
        const value = openString.decoded;
        const start = openString.start;
        cursor = openString.next;
        openString = undefined;
        if (!acceptValue(value, true)) {
          cursor = start;
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
        openString = {
          decoded: "",
          pending: "",
          next: cursor + 1,
          broken: false,
          start: cursor,
        };
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
      const scalar = readScalar(literal);
      if (!scalar) {
        if (!atEnd || !scalarPrefix(literal)) sealed = true;
        break;
      }
      // Every scalar commits only once a delimiter follows it. Until then it is the
      // open tail, so `truex`, `1.x` and `12-3` never read as settled.
      holdingScalar = true;
      heldScalar = scalar.value;
      if (scalarHolds(literal, scalar, atEnd)) break;
      if (!closesScalar(source[cursor + scalar.length] as string)) {
        sealed = true;
        break;
      }
      holdingScalar = false;
      cursor += scalar.length;
      if (!acceptValue(scalar.value, false)) {
        cursor -= scalar.length;
        sealed = true;
        break;
      }
    }
    if (tailStamp !== publishedStamp) dirty = true;
    if (
      holdingScalar !== heldBefore ||
      (holdingScalar && !Object.is(heldScalar, heldValueBefore))
    ) {
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
  function openPath(): JsonPath {
    const path: Array<string | number> = [];
    for (let index = 1; index < openFrames.length; index += 1) {
      const link = (openFrames[index] as OpenFrame)[frameLink];
      path.push(
        (openFrames[index - 1] as OpenFrame)[frameArray] ? Number(link) : link,
      );
    }
    const frame = currentFrame();
    if (frame && partialTail().include)
      path.push(
        frame[frameArray]
          ? (frame[frameItems] as unknown[]).length
          : (frame[frameKey] as string),
      );
    return path;
  }
  return {
    push,
    openPath,
    tailOpen: () => partialTail().include,
    complete: () =>
      done && !sealed && !trailingComma && source.slice(cursor).trim() === "",
    ended: () => {
      if (sealed || trailingComma) return false;
      const tail = source.slice(cursor).trim();
      return done
        ? tail === ""
        : openFrames.length === 0 &&
            (jsonNumber.test(tail) || keywords.includes(tail));
    },
  };
}

export function createPartialJsonFeed(): PartialJsonFeed {
  return createTrackedFeed().push;
}

/** A `fromAsyncIterableSteps` step: a `JsonStreamStep` that always carries `openPath` and `tailOpen`. */
export type TrackedStep = {
  readonly value: unknown;
  readonly complete: boolean;
  /**
   * Keys from the root to the deepest open value. A value off `openPath` is final
   * unless the document repeats a key on that path later (`JSON.parse` lets the last duplicate win).
   */
  readonly openPath: JsonPath;
  /** True while the last value on `openPath` is a cut-off string, number or keyword. */
  readonly tailOpen: boolean;
};

export async function* fromAsyncIterableSteps(
  source: AsyncIterable<string | Uint8Array>,
  makeFeed: () => TrackedFeed = createTrackedFeed,
): AsyncGenerator<TrackedStep> {
  const feed = makeFeed();
  const decoder = new TextDecoder();
  let last: TrackedStep | undefined;
  function step(text: string): TrackedStep | undefined {
    const partialValue = feed.push(text);
    if (partialValue === undefined) return undefined;
    last = withFrontier(
      { value: partialValue, complete: feed.complete() },
      feed.openPath(),
      feed.tailOpen(),
    );
    return last;
  }
  for await (const sourceChunk of source) {
    const text =
      typeof sourceChunk === "string"
        ? sourceChunk
        : decoder.decode(sourceChunk, { stream: true });
    if (text.length === 0) continue;
    const next = step(text);
    if (next) yield next;
  }
  const flushedText = decoder.decode();
  const flushed = flushedText.length === 0 ? undefined : step(flushedText);
  if (flushed) yield flushed;
  // A complete step has already ended, so only an open step can end here.
  if (last && !last.complete && feed.ended())
    yield withFrontier({ value: last.value, complete: true }, [], false);
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
