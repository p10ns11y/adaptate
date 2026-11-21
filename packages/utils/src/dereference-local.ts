let maximumLocalRefDepth = 500;

let missingRefParserPackageMessage =
  'Optional peer dependency "@apidevtools/json-schema-ref-parser" is required to resolve remote or file $ref pointers. Install it with `pnpm add @apidevtools/json-schema-ref-parser`.';

type JsonRecord = Record<string, unknown>;

type CrawlState = {
  root: object;
  processed: Set<object>;
  resolving: Set<string>;
};

function isContainer(value: unknown): value is object {
  return Boolean(value) && typeof value === 'object';
}

function isRecord(value: unknown): value is JsonRecord {
  return isContainer(value) && !Array.isArray(value);
}

function isInDocumentJsonPointer(pointer: string): boolean {
  return pointer === '#' || pointer.startsWith('#/');
}

function isLocalRefObject(value: unknown): value is JsonRecord & { $ref: string } {
  if (!isRecord(value)) {
    return false;
  }
  let refPointer = value.$ref;
  return typeof refPointer === 'string' && isInDocumentJsonPointer(refPointer);
}

function isExternalRefObject(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  let refPointer = value.$ref;
  return typeof refPointer === 'string' && refPointer.length > 0 && !refPointer.startsWith('#');
}

function hasSiblingProperties(refObject: JsonRecord): boolean {
  for (let key of Object.keys(refObject)) {
    if (key !== '$ref') {
      return true;
    }
  }
  return false;
}

function escapeJsonPointerToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1');
}

function unescapeJsonPointerToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function joinJsonPointer(basePointer: string, token: string): string {
  let escapedToken = escapeJsonPointerToken(token);
  if (basePointer === '#') {
    return `#/${escapedToken}`;
  }
  return `${basePointer}/${escapedToken}`;
}

function throwIfPastMaximumDepth(depth: number, pointer: string): void {
  if (depth > maximumLocalRefDepth) {
    throw new RangeError(
      `Maximum dereference depth (${maximumLocalRefDepth}) exceeded at ${pointer}. This likely indicates an extremely deep or recursive schema.`,
    );
  }
}

function missingPointerMessage(pointer: string, token: string): string {
  return `Missing $ref pointer "${pointer}". Token "${token}" does not exist.`;
}

function readJsonPointer(
  pointer: string,
  depth: number,
  state: CrawlState,
  followIntermediateRefs: boolean,
): unknown {
  if (pointer === '#') {
    return state.root;
  }

  let tokens = pointer.slice(2).split('/').map(unescapeJsonPointerToken);
  let current: unknown = state.root;
  let currentPath = '#';

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    if (followIntermediateRefs) {
      current = followLocalRef(current, currentPath, depth, state);
    }
    let token = tokens[tokenIndex];
    if (!isContainer(current) || !Object.hasOwn(current, token)) {
      throw new Error(missingPointerMessage(pointer, token));
    }
    current = (current as JsonRecord)[token];
    currentPath = joinJsonPointer(currentPath, token);
  }

  return current;
}

function followLocalRef(value: unknown, path: string, depth: number, state: CrawlState): unknown {
  if (!isLocalRefObject(value) || state.resolving.has(path)) {
    return value;
  }
  return resolveLocalRef(value, path, depth, state);
}

function deepMergeResolvedValue(resolvedValue: unknown, siblingValue: object): unknown {
  if (!isContainer(resolvedValue)) {
    return siblingValue;
  }

  let merged: JsonRecord | unknown[] = Array.isArray(resolvedValue)
    ? [...resolvedValue]
    : { ...resolvedValue };
  let siblingRecord = siblingValue as JsonRecord;
  let resolvedRecord = resolvedValue as JsonRecord;

  for (let key of Object.keys(siblingRecord)) {
    let siblingChild = siblingRecord[key];
    if (Array.isArray(siblingChild)) {
      (merged as JsonRecord)[key] = [...siblingChild];
    } else if (isContainer(siblingChild)) {
      (merged as JsonRecord)[key] = deepMergeResolvedValue(resolvedRecord[key], siblingChild);
    } else {
      (merged as JsonRecord)[key] = siblingChild;
    }
  }

  return merged;
}

function mergeExtendedRef(refObject: JsonRecord, resolvedValue: object): JsonRecord {
  let merged: JsonRecord = {};
  for (let key of Object.keys(refObject)) {
    if (key !== '$ref') {
      merged[key] = refObject[key];
    }
  }

  let resolvedRecord = resolvedValue as JsonRecord;
  for (let key of Object.keys(resolvedRecord)) {
    if (!Object.hasOwn(merged, key)) {
      merged[key] = resolvedRecord[key];
    } else if (isContainer(merged[key]) && isContainer(resolvedRecord[key])) {
      merged[key] = deepMergeResolvedValue(resolvedRecord[key], merged[key] as object);
    }
  }

  return merged;
}

function resolveLocalRef(
  refObject: JsonRecord & { $ref: string },
  refObjectPath: string,
  depth: number,
  state: CrawlState,
): unknown {
  throwIfPastMaximumDepth(depth, refObjectPath);

  let pointer = refObject.$ref;
  if (pointer === refObjectPath) {
    return refObject;
  }

  if (state.resolving.has(refObjectPath)) {
    let cycleTarget = readJsonPointer(pointer, depth, state, false);
    if (isLocalRefObject(cycleTarget)) {
      cycleTarget.$ref = refObjectPath;
    }
    return cycleTarget;
  }

  state.resolving.add(refObjectPath);
  try {
    let target = readJsonPointer(pointer, depth, state, true);
    let resolved: unknown;
    if (isLocalRefObject(target)) {
      resolved = resolveLocalRef(target, pointer, depth + 1, state);
    } else if (isContainer(target)) {
      crawl(target, pointer, depth + 1, state);
      resolved = target;
    } else {
      resolved = target;
    }

    if (hasSiblingProperties(refObject) && isContainer(resolved)) {
      let merged = mergeExtendedRef(refObject, resolved);
      crawl(merged, refObjectPath, depth + 1, state);
      return merged;
    }

    return resolved;
  } finally {
    state.resolving.delete(refObjectPath);
  }
}

function crawl(value: object, path: string, depth: number, state: CrawlState): void {
  if (state.processed.has(value)) {
    return;
  }
  throwIfPastMaximumDepth(depth, path);
  state.processed.add(value);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      let childPath = joinJsonPointer(path, String(index));
      let child = value[index];
      if (isLocalRefObject(child)) {
        value[index] = resolveLocalRef(child, childPath, depth + 1, state);
      } else if (isContainer(child)) {
        crawl(child, childPath, depth + 1, state);
      } else {
        throwIfPastMaximumDepth(depth + 1, childPath);
      }
    }
    return;
  }

  let record = value as JsonRecord;
  for (let key of Object.keys(record)) {
    let childPath = joinJsonPointer(path, key);
    let child = record[key];
    if (isLocalRefObject(child)) {
      record[key] = resolveLocalRef(child, childPath, depth + 1, state);
    } else if (isContainer(child)) {
      crawl(child, childPath, depth + 1, state);
    } else {
      throwIfPastMaximumDepth(depth + 1, childPath);
    }
  }
}

function documentContainsExternalRef(document: unknown): boolean {
  let seen = new Set<object>();

  function visit(value: unknown): boolean {
    if (!isContainer(value)) {
      return false;
    }
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    if (isExternalRefObject(value)) {
      return true;
    }
    if (Array.isArray(value)) {
      for (let item of value) {
        if (visit(item)) {
          return true;
        }
      }
      return false;
    }
    for (let child of Object.values(value as JsonRecord)) {
      if (visit(child)) {
        return true;
      }
    }
    return false;
  }

  return visit(document);
}

export function dereferenceLocalDocument(document: unknown): unknown {
  if (!isContainer(document)) {
    return document;
  }

  let state: CrawlState = {
    root: document,
    processed: new Set(),
    resolving: new Set(),
  };

  if (isLocalRefObject(document)) {
    return resolveLocalRef(document, '#', 0, state);
  }

  crawl(document, '#', 0, state);
  return document;
}

async function dereferenceWithOptionalParser(document: unknown): Promise<unknown> {
  let parserModule: typeof import('@apidevtools/json-schema-ref-parser');
  try {
    parserModule = await import('@apidevtools/json-schema-ref-parser');
  } catch {
    throw new Error(missingRefParserPackageMessage);
  }

  let parser = parserModule.default;
  if (!parser || typeof parser.dereference !== 'function') {
    throw new Error(missingRefParserPackageMessage);
  }

  return parser.dereference(document as object);
}

export async function dereferenceOpenApiDocument(document: unknown): Promise<any> {
  if (documentContainsExternalRef(document)) {
    return dereferenceWithOptionalParser(document);
  }
  return dereferenceLocalDocument(document);
}
