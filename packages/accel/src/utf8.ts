export type Utf8DecodeResult =
  | { ok: true; text: string; carry: Uint8Array }
  | { ok: false; reason: "invalid-utf8" };

export function encodeUtf8(text: string): Uint8Array | null {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        appendCodePoint(bytes, point);
        index += 1;
        continue;
      }
      return null;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      return null;
    }
    appendCodePoint(bytes, code);
  }
  return Uint8Array.from(bytes);
}

export function decodeUtf8Chunk(carry: Uint8Array, chunk: Uint8Array): Utf8DecodeResult {
  const combined = new Uint8Array(carry.length + chunk.length);
  combined.set(carry, 0);
  combined.set(chunk, carry.length);
  const decoded = decodeCompletePrefix(combined);
  if (!decoded.ok) {
    return decoded;
  }
  return { ok: true, text: decoded.text, carry: decoded.carry };
}

function appendCodePoint(bytes: number[], point: number): void {
  if (point < 0x80) {
    bytes.push(point);
    return;
  }
  if (point < 0x800) {
    bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    return;
  }
  if (point < 0x10000) {
    bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    return;
  }
  bytes.push(
    0xf0 | (point >> 18),
    0x80 | ((point >> 12) & 0x3f),
    0x80 | ((point >> 6) & 0x3f),
    0x80 | (point & 0x3f),
  );
}

function decodeCompletePrefix(bytes: Uint8Array): { ok: true; text: string; carry: Uint8Array } | { ok: false; reason: "invalid-utf8" } {
  let index = 0;
  let text = "";
  while (index < bytes.length) {
    const asciiWidth = asciiRunLength(bytes, index);
    if (asciiWidth > 0) {
      text += latin1Slice(bytes, index, index + asciiWidth);
      index += asciiWidth;
      continue;
    }
    const sequence = readSequence(bytes, index);
    if (sequence.kind === "done") {
      text += sequence.character;
      index += sequence.width;
      continue;
    }
    if (sequence.kind === "incomplete") {
      return { ok: true, text, carry: copyBytes(bytes.subarray(index)) };
    }
    return { ok: false, reason: "invalid-utf8" };
  }
  return { ok: true, text, carry: new Uint8Array() };
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function byteAt(bytes: Uint8Array, index: number): number {
  return bytes[index] as number;
}

function latin1Slice(bytes: Uint8Array, start: number, end: number): string {
  let text = "";
  for (let index = start; index < end; index += 1) {
    text += String.fromCharCode(byteAt(bytes, index));
  }
  return text;
}

function asciiRunLength(bytes: Uint8Array, start: number): number {
  let index = start;
  while (index < bytes.length && byteAt(bytes, index) < 0x80) {
    index += 1;
  }
  return index - start;
}

type Sequence =
  | { kind: "done"; character: string; width: number }
  | { kind: "incomplete" }
  | { kind: "invalid" };

function readSequence(bytes: Uint8Array, start: number): Sequence {
  const lead = byteAt(bytes, start);
  const width = sequenceWidth(lead);
  if (width === 0) {
    return { kind: "invalid" };
  }
  if (width === 2 && lead < 0xc2) {
    return { kind: "invalid" };
  }
  if (width === 4 && lead > 0xf4) {
    return { kind: "invalid" };
  }
  const available = bytes.length - start;
  if (available < width) {
    return prefixHolds(bytes, start, lead) ? { kind: "incomplete" } : { kind: "invalid" };
  }
  if (!continuationsHold(bytes, start, width) || !rangesHold(lead, byteAt(bytes, start + 1))) {
    return { kind: "invalid" };
  }
  const point = decodePoint(bytes, start, width);
  return { kind: "done", character: String.fromCodePoint(point), width };
}

function sequenceWidth(lead: number): number {
  if ((lead & 0xe0) === 0xc0) return 2;
  if ((lead & 0xf0) === 0xe0) return 3;
  if ((lead & 0xf8) === 0xf0) return 4;
  return 0;
}

function continuationsHold(bytes: Uint8Array, start: number, width: number): boolean {
  for (let offset = 1; offset < width; offset += 1) {
    if ((byteAt(bytes, start + offset) & 0xc0) !== 0x80) {
      return false;
    }
  }
  return true;
}

function prefixHolds(bytes: Uint8Array, start: number, lead: number): boolean {
  const available = bytes.length - start;
  if (available <= 1) {
    return true;
  }
  const second = byteAt(bytes, start + 1);
  if ((second & 0xc0) !== 0x80 || !rangesHold(lead, second)) {
    return false;
  }
  for (let offset = 2; offset < available; offset += 1) {
    if ((byteAt(bytes, start + offset) & 0xc0) !== 0x80) {
      return false;
    }
  }
  return true;
}

function rangesHold(lead: number, second: number): boolean {
  if (lead === 0xe0) return second >= 0xa0;
  if (lead === 0xed) return second <= 0x9f;
  if (lead === 0xf0) return second >= 0x90;
  if (lead === 0xf4) return second <= 0x8f;
  return true;
}

function decodePoint(bytes: Uint8Array, start: number, width: number): number {
  const lead = byteAt(bytes, start);
  const second = byteAt(bytes, start + 1);
  const third = byteAt(bytes, start + 2);
  const fourth = byteAt(bytes, start + 3);
  if (width === 2) {
    return ((lead & 0x1f) << 6) | (second & 0x3f);
  }
  if (width === 3) {
    return ((lead & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f);
  }
  return ((lead & 0x07) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
}
