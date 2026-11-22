import { orderSchema } from "./order-schema";
import type { LoadChunk, ProtocolName } from "./load-script";
import { clipText, describeChunk } from "./load-script";
import { checkTanStackStream } from "./usages/tanstack";
import {
  createIncrementalOrderValidator,
  createReparseOrderValidator,
} from "./usages/ag-ui";

export type RunStatus = "running" | "done" | "stopped";

export type CallSnapshot = {
  toolCallId: string;
  protocol: ProtocolName;
  reparseTitle: string;
  incrementalTitle: string;
  reparseNotes: number;
  incrementalNotes: number;
  reparseItems: number;
  incrementalItems: number;
  reparseValid: boolean | undefined;
  incrementalValid: boolean | undefined;
};

export type EngineSeries = {
  micros: number[];
  droppedFrames: number[];
};

export type LoadSnapshot = {
  status: RunStatus;
  chunks: number;
  reparseMicros: number;
  incrementalMicros: number;
  reparseDropped: number;
  incrementalDropped: number;
  reparse: EngineSeries;
  incremental: EngineSeries;
  heapBytes: number[];
  calls: CallSnapshot[];
  latestProtocol: ProtocolName | "";
  latestPreview: string;
  latestDelta: string;
  latestTitle: string;
  tanstackPartialValid: boolean | undefined;
  tanstackFinalValid: boolean | undefined;
};

let frameMicros = 16_667;
let bucketMs = 250;

type EngineBucket = {
  micros: number[];
  droppedFrames: number[];
  dropped: number;
  bucketStart: number;
  bucketSum: number;
  bucketCount: number;
};

type PartialSummary = {
  title: string;
  noteChars: number;
  itemCount: number;
};

export function initialSnapshot(): LoadSnapshot {
  return {
    status: "running",
    chunks: 0,
    reparseMicros: 0,
    incrementalMicros: 0,
    reparseDropped: 0,
    incrementalDropped: 0,
    reparse: { micros: [], droppedFrames: [] },
    incremental: { micros: [], droppedFrames: [] },
    heapBytes: [],
    calls: [],
    latestProtocol: "",
    latestPreview: "",
    latestDelta: "",
    latestTitle: "",
    tanstackPartialValid: undefined,
    tanstackFinalValid: undefined,
  };
}

export function createLoadSession() {
  let reparseValidator = createReparseOrderValidator();
  let incrementalValidator = createIncrementalOrderValidator();
  let calls = new Map<string, CallSnapshot>();
  let reparseBucket = emptyBucket();
  let incrementalBucket = emptyBucket();
  let heapBytes: number[] = [];
  let chunks = 0;
  let status: RunStatus = "running";
  let latestProtocol: ProtocolName | "" = "";
  let latestPreview = "";
  let latestDelta = "";
  let latestTitle = "";
  let tanstackPartialValid: boolean | undefined;
  let tanstackFinalValid: boolean | undefined;
  let lastPartial: unknown;
  let lastReparseMicros = 0;
  let lastIncrementalMicros = 0;

  function absorb(chunk: LoadChunk): LoadSnapshot {
    if (status !== "running") return snapshot();
    let reparse = measure(() =>
      reparseValidator({
        type: "TOOL_CALL_ARGS",
        toolCallId: chunk.toolCallId,
        delta: chunk.delta,
      }),
    );
    let incremental = measure(() =>
      incrementalValidator({
        type: "TOOL_CALL_ARGS",
        toolCallId: chunk.toolCallId,
        delta: chunk.delta,
      }),
    );
    lastReparseMicros = reparse.micros;
    lastIncrementalMicros = incremental.micros;
    let call = calls.get(chunk.toolCallId);
    if (!call) {
      call = {
        toolCallId: chunk.toolCallId,
        protocol: chunk.protocol,
        reparseTitle: "",
        incrementalTitle: "",
        reparseNotes: 0,
        incrementalNotes: 0,
        reparseItems: 0,
        incrementalItems: 0,
        reparseValid: undefined,
        incrementalValid: undefined,
      };
      calls.set(chunk.toolCallId, call);
    }
    let reparseOutcome = readOutcome(reparse.value);
    let incrementalOutcome = readOutcome(incremental.value);
    if (reparseOutcome) {
      let summary = summarizePartial(reparseOutcome.partial);
      call.reparseTitle = summary.title;
      call.reparseNotes = summary.noteChars;
      call.reparseItems = summary.itemCount;
      call.reparseValid = reparseOutcome.valid;
      lastPartial = reparseOutcome.partial;
    }
    if (incrementalOutcome) {
      let summary = summarizePartial(incrementalOutcome.partial);
      call.incrementalTitle = summary.title;
      call.incrementalNotes = summary.noteChars;
      call.incrementalItems = summary.itemCount;
      call.incrementalValid = incrementalOutcome.valid;
      lastPartial = incrementalOutcome.partial;
    }
    noteSample(reparseBucket, chunk.atMs, reparse.micros);
    noteSample(incrementalBucket, chunk.atMs, incremental.micros);
    let heap = readUsedHeapBytes();
    if (heap !== undefined && reparseBucket.micros.length > heapBytes.length) {
      heapBytes.push(heap);
    }
    chunks += 1;
    latestProtocol = chunk.protocol;
    latestPreview = describeChunk(chunk);
    latestDelta = clipText(chunk.delta, 96);
    latestTitle = call.incrementalTitle || call.reparseTitle;
    tanstackPartialValid = call.incrementalValid ?? call.reparseValid;
    return snapshot();
  }

  function finish(): LoadSnapshot {
    if (status === "running") status = "done";
    flush(reparseBucket);
    flush(incrementalBucket);
    let heap = readUsedHeapBytes();
    if (heap !== undefined) heapBytes.push(heap);
    let finalOrder = orderSchema.safeParse(lastPartial);
    if (finalOrder.success) {
      tanstackFinalValid = checkTanStackStream({
        partial: null,
        final: finalOrder.data,
      }).final?.card.valid;
    }
    return snapshot();
  }

  function stop(): LoadSnapshot {
    if (status === "running") status = "stopped";
    flush(reparseBucket);
    flush(incrementalBucket);
    return snapshot();
  }

  function snapshot(): LoadSnapshot {
    return {
      status,
      chunks,
      reparseMicros: latestMicros(reparseBucket, lastReparseMicros),
      incrementalMicros: latestMicros(incrementalBucket, lastIncrementalMicros),
      reparseDropped: reparseBucket.dropped,
      incrementalDropped: incrementalBucket.dropped,
      reparse: {
        micros: reparseBucket.micros.slice(),
        droppedFrames: reparseBucket.droppedFrames.slice(),
      },
      incremental: {
        micros: incrementalBucket.micros.slice(),
        droppedFrames: incrementalBucket.droppedFrames.slice(),
      },
      heapBytes: heapBytes.slice(),
      calls: [...calls.values()],
      latestProtocol,
      latestPreview,
      latestDelta,
      latestTitle,
      tanstackPartialValid,
      tanstackFinalValid,
    };
  }

  return { absorb, finish, stop };
}

function emptyBucket(): EngineBucket {
  return {
    micros: [],
    droppedFrames: [],
    dropped: 0,
    bucketStart: 0,
    bucketSum: 0,
    bucketCount: 0,
  };
}

function noteSample(bucket: EngineBucket, atMs: number, micros: number): void {
  if (micros > frameMicros) {
    bucket.dropped += Math.max(1, Math.floor(micros / frameMicros));
  }
  if (atMs - bucket.bucketStart >= bucketMs && bucket.bucketCount > 0) {
    bucket.micros.push(bucket.bucketSum / bucket.bucketCount);
    bucket.droppedFrames.push(bucket.dropped);
    bucket.bucketStart = atMs;
    bucket.bucketSum = 0;
    bucket.bucketCount = 0;
  }
  bucket.bucketSum += micros;
  bucket.bucketCount += 1;
}

function flush(bucket: EngineBucket): void {
  if (bucket.bucketCount === 0) return;
  bucket.micros.push(bucket.bucketSum / bucket.bucketCount);
  bucket.droppedFrames.push(bucket.dropped);
  bucket.bucketSum = 0;
  bucket.bucketCount = 0;
}

function latestMicros(bucket: EngineBucket, lastChunkMicros: number): number {
  if (bucket.micros.length > 0) return bucket.micros[bucket.micros.length - 1] ?? lastChunkMicros;
  if (bucket.bucketCount > 0) return bucket.bucketSum / bucket.bucketCount;
  return lastChunkMicros;
}

function measure<T>(run: () => T): { value: T; micros: number } {
  let started = performance.now();
  let value = run();
  return { value, micros: (performance.now() - started) * 1000 };
}

function readOutcome(outcome: unknown): { partial: unknown; valid: boolean } | undefined {
  if (!outcome || typeof outcome !== "object") return undefined;
  let record = outcome as {
    partial?: unknown;
    results?: { card?: { valid?: unknown } };
  };
  if (typeof record.results?.card?.valid !== "boolean") return undefined;
  return { partial: record.partial, valid: record.results.card.valid };
}

function summarizePartial(value: unknown): PartialSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { title: "", noteChars: 0, itemCount: 0 };
  }
  let record = value as { title?: unknown; notes?: unknown; items?: unknown };
  return {
    title: typeof record.title === "string" ? record.title : "",
    noteChars: typeof record.notes === "string" ? record.notes.length : 0,
    itemCount: Array.isArray(record.items) ? record.items.length : 0,
  };
}

function readUsedHeapBytes(): number | undefined {
  let candidate = performance as Performance & { memory?: { usedJSHeapSize?: number } };
  let used = candidate.memory?.usedJSHeapSize;
  if (typeof used !== "number" || !Number.isFinite(used)) return undefined;
  return used;
}
