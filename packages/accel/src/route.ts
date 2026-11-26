import {
  GPU_THRESHOLD_BYTES,
  jsCapabilities,
  SMALL_THRESHOLD_BYTES,
  type BackendName,
  type RouteInput,
  type RouteOptions,
} from "./types.js";

export function byteLengthOf(input: RouteInput): number | null {
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    return input.byteLength;
  }
  return null;
}

export function routeByteLength(byteLength: number | null, options: RouteOptions = {}): BackendName {
  const smallThreshold = options.smallThresholdBytes ?? SMALL_THRESHOLD_BYTES;
  const gpuThreshold = options.gpuThresholdBytes ?? GPU_THRESHOLD_BYTES;
  const capabilities = options.capabilities ?? jsCapabilities;
  const workload = options.workload ?? "parse";
  if (byteLength === null || byteLength < smallThreshold) {
    return "js";
  }
  if (workload === "verify" && byteLength >= gpuThreshold && capabilities.gpu) {
    return "gpu";
  }
  if (capabilities.native) return "native";
  if (capabilities.wasm) return "wasm";
  return "js";
}

export function routePayload(input: RouteInput, options: RouteOptions = {}): BackendName {
  return routeByteLength(byteLengthOf(input), options);
}

export function fallbackOrder(selected: BackendName): BackendName[] {
  switch (selected) {
    case "gpu":
      return ["gpu", "native", "wasm", "js"];
    case "native":
      return ["native", "wasm", "js"];
    case "wasm":
      return ["wasm", "js"];
    case "js":
      return ["js"];
    default: {
      const unexpected: never = selected;
      throw new Error(String(unexpected));
    }
  }
}
