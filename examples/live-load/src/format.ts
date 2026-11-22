export function formatMicros(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 100) {
    return Math.round(value).toLocaleString("en-US");
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function formatElapsed(elapsedMs: number): string {
  return `${(elapsedMs / 1000).toFixed(1)} s`;
}

export function formatHeap(bytes: number): string {
  return `${(bytes / 1_048_576).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
}

export function readiness(valid: boolean | undefined): string {
  if (valid === undefined) return "Waiting";
  if (valid) return "Ready";
  return "Blocked";
}
