import type { JsonValue, ScanFailureReason, ScanSnapshot } from "./types.js";
import { MAX_DEPTH } from "./types.js";
import { decodeUtf8Chunk, encodeUtf8 } from "./utf8.js";

type ParseStep =
  | { kind: "need-more" }
  | { kind: "invalid" }
  | { kind: "value"; value: JsonValue; next: number };

type StringStep =
  | { kind: "need-more" }
  | { kind: "invalid" }
  | { kind: "value"; value: string; next: number };

type UnicodeStep =
  | { kind: "need-more" }
  | { kind: "invalid" }
  | { kind: "char"; character: string; next: number };

export class StreamParser {
  private carry: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private text = "";
  private consumed = 0;
  private values: JsonValue[] = [];
  private failure: ScanFailureReason | undefined;

  push(chunk: Uint8Array | string): ScanSnapshot {
    if (this.failure !== undefined) {
      return this.snapshot();
    }
    const bytes = typeof chunk === "string" ? encodeUtf8(chunk) : chunk;
    if (bytes === null) {
      this.failure = "invalid-utf8";
      return this.snapshot();
    }
    const decoded = decodeUtf8Chunk(this.carry, bytes);
    if (!decoded.ok) {
      this.failure = decoded.reason;
      return this.snapshot();
    }
    this.carry = decoded.carry;
    this.text += decoded.text;
    return this.drain(false);
  }

  finish(): ScanSnapshot {
    if (this.failure !== undefined) {
      return this.snapshot();
    }
    if (this.carry.length > 0) {
      this.failure = "truncated-utf8";
      return this.snapshot();
    }
    return this.drain(true);
  }

  private snapshot(): ScanSnapshot {
    if (this.failure !== undefined) {
      return { status: "error", values: this.values.slice(), reason: this.failure };
    }
    const remainderStart = skipWhitespace(this.text, this.consumed);
    const pendingBody = remainderStart < this.text.length;
    if (this.values.length === 0 || pendingBody) {
      return { status: "pending", values: this.values.slice() };
    }
    return { status: "ready", values: this.values.slice() };
  }

  private drain(endOfStream: boolean): ScanSnapshot {
    for (;;) {
      const bodyStart = skipWhitespace(this.text, this.consumed);
      if (bodyStart >= this.text.length) {
        this.consumed = bodyStart;
        if (this.values.length === 0 && endOfStream) {
          this.failure = "truncated-json";
        }
        return this.snapshot();
      }
      const step = parseValue(this.text, bodyStart, endOfStream, 0);
      if (step.kind === "need-more") {
        this.consumed = bodyStart;
        if (endOfStream) {
          this.failure = "truncated-json";
        }
        return this.snapshot();
      }
      if (step.kind === "invalid") {
        this.failure = "invalid-json";
        return this.snapshot();
      }
      this.consumed = step.next;
      this.values.push(step.value);
    }
  }
}

export function createStreamParser(): StreamParser {
  return new StreamParser();
}

function skipWhitespace(text: string, start: number): number {
  let index = start;
  while (index < text.length && isWhitespace(text.charCodeAt(index))) {
    index += 1;
  }
  return index;
}

function isWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x0a || code === 0x0d || code === 0x09;
}

function isDelimiter(code: number): boolean {
  return isWhitespace(code) || code === 0x2c || code === 0x5d || code === 0x7d || code === 0x3a;
}

function parseValue(text: string, start: number, endOfStream: boolean, depth: number): ParseStep {
  if (start >= text.length) {
    return { kind: "need-more" };
  }
  const code = text.charCodeAt(start);
  if (code === 0x6e) return parseLiteral(text, start, "null", null);
  if (code === 0x74) return parseLiteral(text, start, "true", true);
  if (code === 0x66) return parseLiteral(text, start, "false", false);
  if (code === 0x22) return parseString(text, start);
  if (code === 0x5b) return parseArray(text, start, endOfStream, depth);
  if (code === 0x7b) return parseObject(text, start, endOfStream, depth);
  if (code === 0x2d || (code >= 0x30 && code <= 0x39)) return parseNumber(text, start, endOfStream);
  return { kind: "invalid" };
}

function parseLiteral(text: string, start: number, literal: string, value: JsonValue): ParseStep {
  const rest = text.slice(start);
  if (rest.startsWith(literal)) {
    const next = start + literal.length;
    if (next < text.length && !isDelimiter(text.charCodeAt(next))) {
      return { kind: "invalid" };
    }
    return { kind: "value", value, next };
  }
  if (literal.startsWith(rest) && rest.length < literal.length) {
    return { kind: "need-more" };
  }
  return { kind: "invalid" };
}

function parseNumber(text: string, start: number, endOfStream: boolean): ParseStep {
  let index = start;
  if (text.charCodeAt(index) === 0x2d) {
    index += 1;
  }
  if (index >= text.length) {
    return endOfStream ? { kind: "invalid" } : { kind: "need-more" };
  }
  const firstDigit = text.charCodeAt(index);
  if (firstDigit < 0x30 || firstDigit > 0x39) {
    return { kind: "invalid" };
  }
  if (firstDigit === 0x30) {
    index += 1;
    if (index < text.length && isDigit(text.charCodeAt(index))) {
      return { kind: "invalid" };
    }
  } else {
    while (index < text.length && isDigit(text.charCodeAt(index))) {
      index += 1;
    }
  }
  if (index >= text.length && !endOfStream) {
    return { kind: "need-more" };
  }
  if (index < text.length && text.charCodeAt(index) === 0x2e) {
    index += 1;
    const fractionStart = index;
    while (index < text.length && isDigit(text.charCodeAt(index))) {
      index += 1;
    }
    if (index === fractionStart) {
      return index >= text.length && !endOfStream ? { kind: "need-more" } : { kind: "invalid" };
    }
  }
  if (index >= text.length && !endOfStream) {
    return { kind: "need-more" };
  }
  if (index < text.length && (text.charCodeAt(index) === 0x65 || text.charCodeAt(index) === 0x45)) {
    index += 1;
    if (index < text.length && (text.charCodeAt(index) === 0x2b || text.charCodeAt(index) === 0x2d)) {
      index += 1;
    }
    if (index >= text.length && !endOfStream) {
      return { kind: "need-more" };
    }
    const exponentStart = index;
    while (index < text.length && isDigit(text.charCodeAt(index))) {
      index += 1;
    }
    if (index === exponentStart) {
      return { kind: "invalid" };
    }
  }
  if (index >= text.length && !endOfStream) {
    return { kind: "need-more" };
  }
  const token = text.slice(start, index);
  const number = Number(token);
  if (!Number.isFinite(number)) {
    return { kind: "invalid" };
  }
  return { kind: "value", value: number, next: index };
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function parseString(text: string, start: number): StringStep {
  if (text.charCodeAt(start) !== 0x22) {
    return { kind: "invalid" };
  }
  let index = start + 1;
  let output = "";
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code === 0x22) {
      return { kind: "value", value: output, next: index + 1 };
    }
    if (code === 0x5c) {
      if (index + 1 >= text.length) {
        return { kind: "need-more" };
      }
      const escape = text.charCodeAt(index + 1);
      const simple = simpleEscape(escape);
      if (simple !== undefined) {
        output += simple;
        index += 2;
        continue;
      }
      if (escape === 0x75) {
        const unicode = readUnicodeEscape(text, index);
        if (unicode.kind !== "char") {
          return unicode;
        }
        output += unicode.character;
        index = unicode.next;
        continue;
      }
      return { kind: "invalid" };
    }
    if (code < 0x20) {
      return { kind: "invalid" };
    }
    const point = text.codePointAt(index) as number;
    output += String.fromCodePoint(point);
    index += point > 0xffff ? 2 : 1;
  }
  return { kind: "need-more" };
}

function simpleEscape(escape: number): string | undefined {
  if (escape === 0x22 || escape === 0x5c || escape === 0x2f) return String.fromCharCode(escape);
  if (escape === 0x62) return "\u0008";
  if (escape === 0x66) return "\u000c";
  if (escape === 0x6e) return "\n";
  if (escape === 0x72) return "\r";
  if (escape === 0x74) return "\t";
  return undefined;
}

function readUnicodeEscape(text: string, backslash: number): UnicodeStep {
  const hexStart = backslash + 2;
  const code = readHex4(text, hexStart);
  if (typeof code !== "number") {
    return code;
  }
  if (code >= 0xdc00 && code <= 0xdfff) {
    return { kind: "invalid" };
  }
  if (code >= 0xd800 && code <= 0xdbff) {
    const pairAt = hexStart + 4;
    if (pairAt >= text.length) {
      return { kind: "need-more" };
    }
    if (text.charCodeAt(pairAt) !== 0x5c) {
      return { kind: "invalid" };
    }
    if (pairAt + 1 >= text.length) {
      return { kind: "need-more" };
    }
    if (text.charCodeAt(pairAt + 1) !== 0x75) {
      return { kind: "invalid" };
    }
    const low = readHex4(text, pairAt + 2);
    if (typeof low !== "number") {
      return low;
    }
    if (low < 0xdc00 || low > 0xdfff) {
      return { kind: "invalid" };
    }
    const point = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
    return { kind: "char", character: String.fromCodePoint(point), next: pairAt + 6 };
  }
  return { kind: "char", character: String.fromCodePoint(code), next: hexStart + 4 };
}

function readHex4(text: string, start: number): number | { kind: "need-more" } | { kind: "invalid" } {
  if (start + 4 > text.length) {
    for (let offset = start; offset < text.length; offset += 1) {
      if (hexValue(text.charCodeAt(offset)) === undefined) {
        return { kind: "invalid" };
      }
    }
    return { kind: "need-more" };
  }
  let code = 0;
  for (let offset = 0; offset < 4; offset += 1) {
    const digit = hexValue(text.charCodeAt(start + offset));
    if (digit === undefined) {
      return { kind: "invalid" };
    }
    code = (code << 4) | digit;
  }
  return code;
}

function hexValue(code: number): number | undefined {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  return undefined;
}

function parseArray(text: string, start: number, endOfStream: boolean, depth: number): ParseStep {
  if (depth >= MAX_DEPTH) {
    return { kind: "invalid" };
  }
  let index = start + 1;
  const items: JsonValue[] = [];
  for (;;) {
    index = skipWhitespace(text, index);
    if (index >= text.length) {
      return { kind: "need-more" };
    }
    if (text.charCodeAt(index) === 0x5d) {
      if (items.length > 0) {
        return { kind: "invalid" };
      }
      return { kind: "value", value: items, next: index + 1 };
    }
    const step = parseValue(text, index, endOfStream, depth + 1);
    if (step.kind !== "value") {
      return step;
    }
    items.push(step.value);
    index = skipWhitespace(text, step.next);
    if (index >= text.length) {
      return { kind: "need-more" };
    }
    if (text.charCodeAt(index) === 0x2c) {
      index += 1;
      continue;
    }
    if (text.charCodeAt(index) === 0x5d) {
      return { kind: "value", value: items, next: index + 1 };
    }
    return { kind: "invalid" };
  }
}

function parseObject(text: string, start: number, endOfStream: boolean, depth: number): ParseStep {
  if (depth >= MAX_DEPTH) {
    return { kind: "invalid" };
  }
  let index = start + 1;
  const fields: Record<string, JsonValue> = {};
  for (;;) {
    index = skipWhitespace(text, index);
    if (index >= text.length) {
      return { kind: "need-more" };
    }
    if (text.charCodeAt(index) === 0x7d) {
      if (Object.keys(fields).length > 0) {
        return { kind: "invalid" };
      }
      return { kind: "value", value: fields, next: index + 1 };
    }
    const keyStep = parseString(text, index);
    if (keyStep.kind !== "value") {
      return keyStep;
    }
    index = skipWhitespace(text, keyStep.next);
    if (index >= text.length) {
      return { kind: "need-more" };
    }
    if (text.charCodeAt(index) !== 0x3a) {
      return { kind: "invalid" };
    }
    index = skipWhitespace(text, index + 1);
    const step = parseValue(text, index, endOfStream, depth + 1);
    if (step.kind !== "value") {
      return step;
    }
    fields[keyStep.value] = step.value;
    index = skipWhitespace(text, step.next);
    if (index >= text.length) {
      return { kind: "need-more" };
    }
    if (text.charCodeAt(index) === 0x2c) {
      index += 1;
      continue;
    }
    if (text.charCodeAt(index) === 0x7d) {
      return { kind: "value", value: fields, next: index + 1 };
    }
    return { kind: "invalid" };
  }
}
