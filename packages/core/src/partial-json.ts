export function createPartialJsonFeed(): (chunk: string) => unknown {
  let source = "";
  let cursor = 0;
  let closers = "";
  let flags = 0;
  let lastValue: unknown;
  return function push(chunk: string) {
    source += chunk;
    const marks: Array<number | string> = [];
    while (cursor < source.length) {
      const character = source[cursor];
      cursor += 1;
      if (flags & 1) {
        if (flags & 2) flags &= 1;
        else if (character === "\\") flags |= 2;
        else if (character === '"') flags = 0;
      } else if (character === '"') flags = 1;
      else if (character === "{") closers = "}" + closers;
      else if (character === "[") closers = "]" + closers;
      else if (character === "}" || character === "]") closers = closers.slice(1);
      marks.push(cursor, closers, flags);
    }
    for (let index = marks.length - 3; index >= 0; index -= 3) {
      let body = source.slice(0, marks[index] as number);
      const markFlags = marks[index + 2] as number;
      if (markFlags & 1) body = (markFlags & 2 ? body.slice(0, -1) : body) + '"';
      const repaired = body.replace(/[\s,:]+$/, "") + (marks[index + 1] as string);
      if (!repaired) continue;
      try {
        lastValue = JSON.parse(repaired);
        return lastValue;
      } catch {}
    }
    return lastValue;
  };
}

export type PartialJsonParser = {
  push(chunk: string): unknown;
  visits: number;
};

export function createPartialJsonParser(): PartialJsonParser {
  const pushChunk = createPartialJsonFeed();
  let visits = 0;
  const parseJson = JSON.parse;
  return {
    get visits() {
      return visits;
    },
    push(chunk: string) {
      JSON.parse = ((text: string) => {
        visits += text.length;
        return parseJson(text);
      }) as typeof JSON.parse;
      try {
        return pushChunk(chunk);
      } finally {
        JSON.parse = parseJson;
      }
    },
  };
}
