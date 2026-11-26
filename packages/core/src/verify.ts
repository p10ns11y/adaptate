export type VerifyCheck = "hash" | "size" | "mime" | "name" | "formal" | "custom";

export interface VerifyFailure {
  readonly check: VerifyCheck;
  readonly message: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
}

export type VerifyResult<T = Uint8Array> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failures: readonly VerifyFailure[] };

export interface VerifyContext {
  readonly bytes: Uint8Array;
  readonly mime?: string;
  readonly name?: string;
}

export interface Verifier {
  readonly check: VerifyCheck;
  verify(context: VerifyContext): VerifyResult | Promise<VerifyResult>;
}

export type HashAlgorithm = "SHA-256" | "SHA-384" | "SHA-512";

export interface VerifyManifest {
  readonly hash?: {
    readonly algorithm?: HashAlgorithm;
    readonly value: string;
  };
  readonly size?: number;
  readonly mime?: string;
  readonly name?: string;
  readonly formal?: Verifier | Verifier["verify"];
  readonly custom?: readonly Verifier[];
}

const noChecks: VerifyFailure = {
  check: "custom",
  message: "No verification checks were provided.",
};

function pass<T>(value: T): VerifyResult<T> {
  return { ok: true, value };
}

function fail<T = Uint8Array>(failures: readonly VerifyFailure[]): VerifyResult<T> {
  return { ok: false, failures };
}

function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

function failureFromCause(cause: unknown, check: VerifyCheck): VerifyFailure {
  const message = cause instanceof Error ? cause.message : String(cause);
  return { check, message };
}

async function runVerifier(
  verifier: Verifier,
  context: VerifyContext,
): Promise<readonly VerifyFailure[]> {
  try {
    const result = await verifier.verify(context);
    return result.ok ? [] : result.failures;
  } catch (cause) {
    return [failureFromCause(cause, verifier.check)];
  }
}

export function hexFromBytes(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function normalizeHex(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
}

export async function hashBuffer(
  bytes: Uint8Array,
  algorithm: HashAlgorithm = "SHA-256",
): Promise<VerifyResult<string>> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) {
    return fail<string>([
      {
        check: "hash",
        message: "Web Crypto is unavailable; hash verification failed closed.",
      },
    ]);
  }
  try {
    const digest = new Uint8Array(
      await subtle.digest(algorithm, toBufferSource(bytes)),
    );
    return pass(hexFromBytes(digest));
  } catch (cause) {
    return fail<string>([failureFromCause(cause, "hash")]);
  }
}

function metadataMismatch(
  check: Exclude<VerifyCheck, "hash" | "formal" | "custom">,
  expected: unknown,
  actual: unknown,
): VerifyFailure {
  return {
    check,
    message: `${check} did not match the manifest.`,
    expected,
    actual,
  };
}

function asVerifier(
  check: VerifyCheck,
  verify: Verifier["verify"],
): Verifier {
  return { check, verify };
}

export function verifiersFrom(manifest: VerifyManifest): Verifier[] {
  const verifiers: Verifier[] = [];
  if (manifest.size !== undefined) {
    const expected = manifest.size;
    verifiers.push(
      asVerifier("size", ({ bytes }) =>
        bytes.byteLength === expected
          ? pass(bytes)
          : fail([metadataMismatch("size", expected, bytes.byteLength)]),
      ),
    );
  }
  if (manifest.mime !== undefined) {
    const expected = manifest.mime;
    verifiers.push(
      asVerifier("mime", ({ bytes, mime }) =>
        mime === expected
          ? pass(bytes)
          : fail([metadataMismatch("mime", expected, mime)]),
      ),
    );
  }
  if (manifest.name !== undefined) {
    const expected = manifest.name;
    verifiers.push(
      asVerifier("name", ({ bytes, name }) =>
        name === expected
          ? pass(bytes)
          : fail([metadataMismatch("name", expected, name)]),
      ),
    );
  }
  if (manifest.hash) {
    const expectedHash = manifest.hash;
    verifiers.push(
      asVerifier("hash", async ({ bytes }) => {
        const algorithm = expectedHash.algorithm ?? "SHA-256";
        const hashed = await hashBuffer(bytes, algorithm);
        if (!hashed.ok) return hashed;
        const expected = normalizeHex(expectedHash.value);
        const actual = hashed.value;
        return actual === expected
          ? pass(bytes)
          : fail([
              {
                check: "hash",
                message: "Hash did not match the manifest.",
                expected,
                actual,
              },
            ]);
      }),
    );
  }
  if (manifest.formal) {
    const formal = manifest.formal;
    verifiers.push(
      typeof formal === "function" ? asVerifier("formal", formal) : formal,
    );
  }
  if (manifest.custom) verifiers.push(...manifest.custom);
  return verifiers;
}

function collectBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.byteLength;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

export async function verifyBuffer(
  bytes: Uint8Array,
  manifestOrVerifiers: VerifyManifest | readonly Verifier[],
  context?: Omit<VerifyContext, "bytes">,
): Promise<VerifyResult<Uint8Array>> {
  const verifiers = Array.isArray(manifestOrVerifiers)
    ? [...manifestOrVerifiers]
    : verifiersFrom(manifestOrVerifiers as VerifyManifest);
  if (verifiers.length === 0) return fail([noChecks]);
  const fullContext: VerifyContext = { bytes, ...context };
  const failures: VerifyFailure[] = [];
  for (const verifier of verifiers) {
    failures.push(...(await runVerifier(verifier, fullContext)));
  }
  return failures.length === 0 ? pass(bytes) : fail(failures);
}

export async function verifyStream(
  source: AsyncIterable<Uint8Array>,
  manifestOrVerifiers: VerifyManifest | readonly Verifier[],
  context?: Omit<VerifyContext, "bytes">,
): Promise<VerifyResult<Uint8Array>> {
  const parts: Uint8Array[] = [];
  for await (const part of source) parts.push(part);
  return verifyBuffer(collectBytes(parts), manifestOrVerifiers, context);
}
