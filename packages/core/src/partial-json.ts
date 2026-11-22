const frameItems = 0;
const frameArray = 1;
const framePhase = 2;
const frameKey = 3;
const frameLink = 4;
const phaseKey = 0;
const phaseColon = 1;
const phaseValue = 2;
const phaseComma = 3;

type Container = unknown[] | Record<string, unknown>;
type OpenFrame = [Container, boolean, number, string | undefined, string];

const completeToken =
  /(?:([ \n\r\t]+)|([{}[\]:,])|("(?:[^"\\]|\\.)*")|(true|false|null)|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?))/y;
const numberPrefix = /^(?:-?(?:0|[1-9]\d*)(?:\.\d*)?(?:[eE][+-]?\d*)?|-)/;
const keywordPrefix = /^(?:t|tr|tru|f|fa|fal|fals|n|nu|nul)$/;

function copyContainer(items: Container): Container {
  return Array.isArray(items) ? items.slice() : { ...items };
}

function parsedNumber(text: string): number | undefined {
  let end = (numberPrefix.exec(text) as RegExpExecArray)[0].length;
  while (end > 0 && Number.isNaN(Number(text.slice(0, end)))) end -= 1;
  while (end > 0 && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text.slice(0, end))) {
    end -= 1;
  }
  if (end === 0) return undefined;
  return Number(text.slice(0, end));
}

function parsedString(body: string): string {
  let decoded = "";
  let index = 0;
  while (index < body.length) {
    const character = body[index] as string;
    if (character < " ") break;
    if (character !== "\\") {
      decoded += character;
      index += 1;
      continue;
    }
    const escape = body[index + 1];
    if (escape === undefined) break;
    if (escape === "u") {
      const hex = body.slice(index + 2, index + 6);
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) break;
      decoded += String.fromCharCode(Number.parseInt(hex, 16));
      index += 6;
      continue;
    }
    if (escape === '"') decoded += '"';
    else if (escape === "\\") decoded += "\\";
    else if (escape === "/") decoded += "/";
    else if (escape === "b") decoded += "\b";
    else if (escape === "f") decoded += "\f";
    else if (escape === "n") decoded += "\n";
    else if (escape === "r") decoded += "\r";
    else if (escape === "t") decoded += "\t";
    else break;
    index += 2;
  }
  return decoded;
}

export function createPartialJsonFeed(): (chunk: string) => unknown {
  let source = "";
  let cursor = 0;
  let sealed = false;
  let done = false;
  let hasRoot = false;
  let rootValue: unknown;
  let cached: unknown;
  let hasCache = false;
  const openFrames: OpenFrame[] = [];

  function currentFrame(): OpenFrame | undefined {
    return openFrames[openFrames.length - 1];
  }

  function closeFrame(): void {
    openFrames.pop();
    const parent = currentFrame();
    if (!parent) {
      done = true;
      return;
    }
    parent[framePhase] = phaseComma;
  }

  function commitScalar(value: unknown): void {
    const frame = currentFrame();
    if (!frame) {
      rootValue = value;
      hasRoot = true;
      done = true;
      return;
    }
    if (frame[frameArray]) (frame[frameItems] as unknown[]).push(value);
    else {
      (frame[frameItems] as Record<string, unknown>)[frame[frameKey] as string] = value;
      frame[frameKey] = undefined;
    }
    frame[framePhase] = phaseComma;
  }

  function openContainer(isArray: boolean): void {
    const items: Container = isArray ? [] : {};
    const parent = currentFrame();
    let link = "";
    if (!parent) {
      rootValue = items;
      hasRoot = true;
    } else if (parent[frameArray]) {
      link = String((parent[frameItems] as unknown[]).length);
      (parent[frameItems] as unknown[]).push(items);
    } else {
      link = parent[frameKey] as string;
      (parent[frameItems] as Record<string, unknown>)[link] = items;
      parent[frameKey] = undefined;
    }
    openFrames.push([items, isArray, isArray ? phaseValue : phaseKey, undefined, link]);
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

  function partialTail(): { include: boolean; value: unknown } {
    if (!expectsValue()) return { include: false, value: undefined };
    const rest = source.slice(cursor);
    if (rest.startsWith('"')) {
      return { include: true, value: parsedString(rest.slice(1)) };
    }
    if (numberPrefix.test(rest)) {
      const value = parsedNumber(rest);
      if (value === undefined) return { include: false, value: undefined };
      return { include: true, value };
    }
    return { include: false, value: undefined };
  }

  function snapshot(): unknown {
    const partial = partialTail();
    if (openFrames.length === 0) {
      if (partial.include) return partial.value;
      return hasRoot ? rootValue : undefined;
    }
    const copies = openFrames.map((frame) => copyContainer(frame[frameItems]));
    for (let index = 1; index < copies.length; index += 1) {
      (copies[index - 1] as Record<string, unknown>)[openFrames[index][frameLink]] = copies[index];
    }
    if (partial.include) {
      const leaf = copies[copies.length - 1];
      const frame = openFrames[openFrames.length - 1] as OpenFrame;
      if (frame[frameArray]) (leaf as unknown[]).push(partial.value);
      else (leaf as Record<string, unknown>)[frame[frameKey] as string] = partial.value;
    }
    return copies[0];
  }

  return function push(chunk: string) {
    if (sealed) return cached;
    if (chunk.length === 0 && hasCache) return cached;
    source += chunk;
    while (cursor < source.length && !sealed) {
      completeToken.lastIndex = cursor;
      const matched = completeToken.exec(source);
      if (!matched || matched.index !== cursor) {
        const rest = source.slice(cursor);
        if (
          rest.startsWith('"') ||
          numberPrefix.test(rest) ||
          keywordPrefix.test(rest)
        ) {
          break;
        }
        sealed = true;
        break;
      }
      const token = matched[0];
      if (matched[5] && expectsValue()) {
        const rest = source.slice(cursor);
        const span = (numberPrefix.exec(rest) as RegExpExecArray)[0];
        if (cursor + span.length >= source.length) break;
        if (span.length > token.length) {
          acceptValue(parsedNumber(span), false);
          sealed = true;
          break;
        }
      }
      cursor += token.length;
      if (matched[1]) continue;
      if (matched[2]) {
        if (!acceptStructural(token)) {
          cursor -= token.length;
          sealed = true;
          break;
        }
        continue;
      }
      let value: unknown;
      if (matched[3]) {
        try {
          value = JSON.parse(matched[3]) as unknown;
        } catch {
          acceptValue(parsedString(matched[3].slice(1, -1)), true);
          sealed = true;
          break;
        }
      } else if (matched[5]) value = Number(matched[5]);
      else value = matched[4] === "true" ? true : matched[4] === "false" ? false : null;
      if (!acceptValue(value, Boolean(matched[3]))) {
        cursor -= token.length;
        sealed = true;
        break;
      }
    }
    cached = snapshot();
    hasCache = true;
    return cached;
  };
}

export type PartialJsonParser = {
  push(chunk: string): unknown;
  visits: number;
};

export function createPartialJsonParser(): PartialJsonParser {
  const pushChunk = createPartialJsonFeed();
  let visits = 0;
  return {
    get visits() {
      return visits;
    },
    push(chunk: string) {
      visits += chunk.length;
      return pushChunk(chunk);
    },
  };
}
