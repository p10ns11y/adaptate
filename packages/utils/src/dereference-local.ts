const maximumLocalRefDepth = 500;

let missingRefParserPackageMessage =
  'Optional peer dependency "@apidevtools/json-schema-ref-parser" is required to resolve remote or file $ref pointers. Install it with `pnpm add @apidevtools/json-schema-ref-parser`.';

type JsonRecord = Record<string, unknown>;

type CrawlState = {
  root: object;
  processed: Set<object>;
  resolving: Set<string>;
};

type PointerFrame = {
  kind: 'pointer';
  pointer: string;
  followIntermediateRefs: boolean;
  step: 'enter' | 'walk';
  tokens: string[];
  tokenIndex: number;
  current: unknown;
  currentPath: string;
  followed: boolean;
  suspended: boolean;
};

type ResolveFrame = {
  kind: 'resolve';
  refObject: JsonRecord & { $ref: string };
  refObjectPath: string;
  step: 'enter' | 'after-cycle-read' | 'after-target' | 'after-nested' | 'merge' | 'after-merge-crawl';
  refNesting: number;
  tracking: boolean;
  pointer: string;
  target: unknown;
  resolved: unknown;
  merged: unknown;
  nestedWasRef: boolean;
};

type CrawlFrame = {
  kind: 'crawl';
  value: object;
  path: string;
  step: 'enter' | 'next' | 'after-ref' | 'after-crawl';
  index: number;
  keys: string[];
  arrayMode: boolean;
};

type Frame = PointerFrame | ResolveFrame | CrawlFrame;

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

function throwIfPastMaximumRefNesting(depth: number, pointer: string): void {
  if (depth > maximumLocalRefDepth) {
    throw new RangeError(
      `Maximum dereference depth (${maximumLocalRefDepth}) exceeded at ${pointer}. This likely indicates an extremely deep or recursive schema.`,
    );
  }
}

function missingPointerMessage(pointer: string, token: string): string {
  return `Missing $ref pointer "${pointer}". Token "${token}" does not exist.`;
}

function pointerFrame(pointer: string, followIntermediateRefs: boolean): PointerFrame {
  return {
    kind: 'pointer',
    pointer,
    followIntermediateRefs,
    step: 'enter',
    tokens: [],
    tokenIndex: 0,
    current: undefined,
    currentPath: '#',
    followed: false,
    suspended: false,
  };
}

function resolveFrame(refObject: JsonRecord & { $ref: string }, refObjectPath: string): ResolveFrame {
  return {
    kind: 'resolve',
    refObject,
    refObjectPath,
    step: 'enter',
    refNesting: 0,
    tracking: false,
    pointer: '',
    target: undefined,
    resolved: undefined,
    merged: undefined,
    nestedWasRef: false,
  };
}

function crawlFrame(value: object, path: string): CrawlFrame {
  return {
    kind: 'crawl',
    value,
    path,
    step: 'enter',
    index: 0,
    keys: [],
    arrayMode: false,
  };
}

function deepMergeResolvedValue(resolvedValue: unknown, siblingValue: object): unknown {
  let rootMerged: JsonRecord | unknown[] = Array.isArray(resolvedValue)
    ? [...resolvedValue]
    : { ...(resolvedValue as JsonRecord) };
  let activeSiblings = new Set<object>([siblingValue]);
  let stack: Array<{
    merged: JsonRecord;
    resolved: object;
    sibling: object;
    keys: string[];
    index: number;
  }> = [
    {
      merged: rootMerged as JsonRecord,
      resolved: resolvedValue as object,
      sibling: siblingValue,
      keys: Object.keys(siblingValue),
      index: 0,
    },
  ];

  while (stack.length > 0) {
    let frame = stack[stack.length - 1] as (typeof stack)[number];
    if (frame.index >= frame.keys.length) {
      activeSiblings.delete(frame.sibling);
      stack.pop();
      continue;
    }
    let entryKey = frame.keys[frame.index] as string;
    frame.index += 1;
    let siblingRecord = frame.sibling as JsonRecord;
    let siblingChild = siblingRecord[entryKey];
    if (Array.isArray(siblingChild)) {
      frame.merged[entryKey] = [...siblingChild];
      continue;
    }
    if (isContainer(siblingChild)) {
      let resolvedChild = (frame.resolved as JsonRecord)[entryKey];
      if (!isContainer(resolvedChild)) {
        frame.merged[entryKey] = siblingChild;
        continue;
      }
      if (activeSiblings.has(siblingChild)) {
        throw new RangeError(
          `Maximum dereference depth (${maximumLocalRefDepth}) exceeded during a sibling merge. This likely indicates an extremely deep or recursive schema.`,
        );
      }
      let childMerged: JsonRecord | unknown[] = Array.isArray(resolvedChild)
        ? [...resolvedChild]
        : { ...resolvedChild };
      frame.merged[entryKey] = childMerged;
      activeSiblings.add(siblingChild);
      stack.push({
        merged: childMerged as JsonRecord,
        resolved: resolvedChild,
        sibling: siblingChild,
        keys: Object.keys(siblingChild),
        index: 0,
      });
      continue;
    }
    frame.merged[entryKey] = siblingChild as JsonRecord[string];
  }

  return rootMerged;
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

function documentContainsExternalRef(document: unknown): boolean {
  let seen = new Set<object>();
  let pending: unknown[] = [document];
  while (pending.length > 0) {
    let value = pending.pop();
    if (!isContainer(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    if (isExternalRefObject(value)) {
      return true;
    }
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        pending.push(value[index]);
      }
      continue;
    }
    let children = Object.values(value as JsonRecord);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]);
    }
  }
  return false;
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
  let stack: Frame[] = [];
  let openRefCount = 0;
  let produced: unknown = document;

  function pushFrame(frame: Frame): void {
    if (frame.kind === 'resolve') {
      openRefCount += 1;
      frame.refNesting = openRefCount;
    }
    stack.push(frame);
  }

  function popFrame(): void {
    let frame = stack.pop() as Frame;
    if (frame.kind === 'resolve') {
      openRefCount -= 1;
    }
  }

  if (isLocalRefObject(document)) {
    pushFrame(resolveFrame(document, '#'));
  } else {
    pushFrame(crawlFrame(document, '#'));
  }

  function releaseResolving(): void {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      let frame = stack[index];
      if (frame && frame.kind === 'resolve' && frame.tracking) {
        state.resolving.delete(frame.refObjectPath);
        frame.tracking = false;
      }
    }
  }

  function stepPointer(frame: PointerFrame): void {
    if (frame.step === 'enter') {
      if (frame.pointer === '#') {
        produced = state.root;
        popFrame();
        return;
      }
      frame.tokens = frame.pointer.slice(2).split('/').map(unescapeJsonPointerToken);
      frame.tokenIndex = 0;
      frame.current = state.root;
      frame.currentPath = '#';
      frame.followed = false;
      frame.suspended = false;
      frame.step = 'walk';
    }
    if (frame.tokenIndex >= frame.tokens.length) {
      produced = frame.current;
      popFrame();
      return;
    }
    if (!frame.followed) {
      frame.followed = true;
      if (
        frame.followIntermediateRefs &&
        isLocalRefObject(frame.current) &&
        !state.resolving.has(frame.currentPath)
      ) {
        frame.suspended = true;
        pushFrame(resolveFrame(frame.current, frame.currentPath));
        return;
      }
    } else {
      frame.current = produced;
      frame.suspended = false;
    }
    let token = frame.tokens[frame.tokenIndex] as string;
    if (!isContainer(frame.current) || !Object.hasOwn(frame.current, token)) {
      throw new Error(missingPointerMessage(frame.pointer, token));
    }
    frame.current = (frame.current as JsonRecord)[token];
    frame.currentPath = joinJsonPointer(frame.currentPath, token);
    frame.tokenIndex += 1;
    frame.followed = false;
  }

  function stepResolve(frame: ResolveFrame): void {
    if (frame.step === 'enter') {
      throwIfPastMaximumRefNesting(frame.refNesting, frame.refObjectPath);
      let pointer = frame.refObject.$ref;
      frame.pointer = pointer;
      if (pointer === frame.refObjectPath) {
        produced = frame.refObject;
        popFrame();
        return;
      }
      if (state.resolving.has(frame.refObjectPath)) {
        frame.step = 'after-cycle-read';
        pushFrame(pointerFrame(pointer, false));
        return;
      }
      state.resolving.add(frame.refObjectPath);
      frame.tracking = true;
      frame.step = 'after-target';
      pushFrame(pointerFrame(pointer, true));
      return;
    }
    if (frame.step === 'after-cycle-read') {
      let cycleTarget = produced;
      if (isLocalRefObject(cycleTarget)) {
        cycleTarget.$ref = frame.refObjectPath;
      }
      produced = cycleTarget;
      popFrame();
      return;
    }
    if (frame.step === 'after-target') {
      frame.target = produced;
      if (isLocalRefObject(frame.target)) {
        frame.nestedWasRef = true;
        frame.step = 'after-nested';
        pushFrame(resolveFrame(frame.target, frame.pointer));
        return;
      }
      if (isContainer(frame.target)) {
        frame.nestedWasRef = false;
        frame.step = 'after-nested';
        pushFrame(crawlFrame(frame.target, frame.pointer));
        return;
      }
      frame.resolved = frame.target;
      frame.step = 'merge';
    }
    if (frame.step === 'after-nested') {
      frame.resolved = frame.nestedWasRef ? produced : frame.target;
      frame.step = 'merge';
    }
    if (frame.step === 'merge') {
      if (hasSiblingProperties(frame.refObject) && isContainer(frame.resolved)) {
        frame.merged = mergeExtendedRef(frame.refObject, frame.resolved);
        frame.step = 'after-merge-crawl';
        pushFrame(crawlFrame(frame.merged as object, frame.refObjectPath));
        return;
      }
      produced = frame.resolved;
      state.resolving.delete(frame.refObjectPath);
      frame.tracking = false;
      popFrame();
      return;
    }
    produced = frame.merged;
    state.resolving.delete(frame.refObjectPath);
    frame.tracking = false;
    popFrame();
  }

  function stepCrawl(frame: CrawlFrame): void {
    if (frame.step === 'enter') {
      if (state.processed.has(frame.value)) {
        popFrame();
        return;
      }
      state.processed.add(frame.value);
      frame.arrayMode = Array.isArray(frame.value);
      frame.keys = frame.arrayMode ? [] : Object.keys(frame.value as JsonRecord);
      frame.index = 0;
      frame.step = 'next';
    }
    if (frame.step === 'after-ref') {
      let entryKey = frame.arrayMode ? String(frame.index) : (frame.keys[frame.index] as string);
      (frame.value as JsonRecord)[entryKey] = produced;
      frame.index += 1;
      frame.step = 'next';
    } else if (frame.step === 'after-crawl') {
      frame.index += 1;
      frame.step = 'next';
    }
    let childCount = frame.arrayMode ? (frame.value as unknown[]).length : frame.keys.length;
    if (frame.index >= childCount) {
      popFrame();
      return;
    }
    let entryKey = frame.arrayMode ? String(frame.index) : (frame.keys[frame.index] as string);
    let child = (frame.value as JsonRecord)[entryKey];
    let childPath = joinJsonPointer(frame.path, entryKey);
    if (isLocalRefObject(child)) {
      frame.step = 'after-ref';
      pushFrame(resolveFrame(child, childPath));
      return;
    }
    if (isContainer(child)) {
      frame.step = 'after-crawl';
      pushFrame(crawlFrame(child, childPath));
      return;
    }
    frame.index += 1;
  }

  try {
    while (stack.length > 0) {
      let frame = stack[stack.length - 1] as Frame;
      if (frame.kind === 'pointer') {
        stepPointer(frame);
        continue;
      }
      if (frame.kind === 'resolve') {
        stepResolve(frame);
        continue;
      }
      stepCrawl(frame);
    }
  } catch (error) {
    releaseResolving();
    throw error;
  }

  if (isLocalRefObject(document)) {
    return produced;
  }
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
