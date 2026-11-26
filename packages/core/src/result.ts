import type { StandardIssue, StandardSchemaV1 } from "./standard.js";
import { withFrontier, type JsonPath } from "./frontier.js";
import {
  fromAsyncIterableSteps,
  type TrackedFeed,
  type TrackedStep,
} from "./stream-incremental.js";

export { isSettled, type JsonPath, type TrackedFeed } from "./stream-incremental.js";

export type Issues = ReadonlyArray<StandardIssue>;

export interface Track<T, E> {
  map<U>(transform: (value: T) => U): Result<U, E>;
  flatMap<U, F>(next: (value: T) => Result<U, F>): Result<U, E | F>;
  mapError<F>(transform: (error: E) => F): Result<T, F>;
  recover<U>(fallback: (error: E) => U): Ok<T | U, never>;
  match<U>(onOk: (value: T) => U, onErr: (error: E) => U): U;
}

export interface Ok<T, E = never> extends Track<T, E> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E, T = never> extends Track<T, E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = Issues> = Ok<T, E> | Err<E, T>;

const brand = Symbol.for("adaptate.result");

function branded<R extends object>(result: R): R {
  return Object.defineProperty(result, brand, { value: true });
}

export function isResult(value: unknown): value is Result<unknown, unknown> {
  return typeof value === "object" && value !== null && Object.hasOwn(value, brand);
}

export function ok<T, E = never>(value: T): Ok<T, E> {
  return branded<Ok<T, E>>({
    ok: true,
    value,
    map: (transform) => ok(transform(value)),
    flatMap: (next) => next(value),
    mapError: () => ok(value),
    recover: () => ok(value),
    match: (onOk) => onOk(value),
  });
}

export function err<E, T = never>(error: E): Err<E, T> {
  return branded<Err<E, T>>({
    ok: false,
    error,
    map: () => err(error),
    flatMap: () => err(error),
    mapError: (transform) => err(transform(error)),
    recover: (fallback) => ok(fallback(error)),
    match: (_onOk, onErr) => onErr(error),
  });
}

const asyncSchemaIssue: StandardIssue = {
  message: "This schema validates asynchronously. Use parseAsync.",
};

export function parse<T>(
  schema: StandardSchemaV1<unknown, T>,
  input: unknown,
): Result<T> {
  const checked = schema["~standard"].validate(input);
  if (typeof (checked as { then?: unknown }).then === "function")
    return err([asyncSchemaIssue]);
  const settled = checked as Awaited<typeof checked>;
  return settled.issues ? err(settled.issues) : ok(settled.value);
}

export async function parseAsync<T>(
  schema: StandardSchemaV1<unknown, T>,
  input: unknown,
): Promise<Result<T>> {
  const checked = await schema["~standard"].validate(input);
  return checked.issues ? err(checked.issues) : ok(checked.value);
}

/**
 * One `parseStream` step. `openPath` holds the keys from the root to the deepest open
 * value. A value off `openPath` is final unless the document repeats a key on that path later
 * (`JSON.parse` lets the last duplicate win). A partial step whose partial schema fails
 * has no `result.value`, so no path on it is settled.
 */
export type StreamStep<T, P> =
  | {
      readonly done: false;
      readonly result: Result<P>;
      readonly openPath?: JsonPath;
      readonly tailOpen?: boolean;
    }
  | {
      readonly done: true;
      readonly result: Result<T>;
      readonly openPath?: JsonPath;
      readonly tailOpen?: boolean;
    };

const emptyStreamIssue: StandardIssue = {
  message: "The stream ended before any JSON value arrived.",
};
const openStreamIssue: StandardIssue = {
  message: "The stream ended without one complete JSON value.",
};

export async function* parseStream<T, P = unknown>(
  source: AsyncIterable<string | Uint8Array>,
  schema: StandardSchemaV1<unknown, T>,
  partialSchema?: StandardSchemaV1<unknown, P>,
  makeFeed?: () => TrackedFeed,
): AsyncGenerator<StreamStep<T, P>> {
  let latest: TrackedStep | undefined;
  for await (const step of fromAsyncIterableSteps(source, makeFeed)) {
    latest = step;
    const result = partialSchema
      ? await parseAsync(partialSchema, step.value)
      : ok(step.value as P);
    yield withFrontier(
      { done: false as const, result },
      step.openPath,
      step.tailOpen,
    );
  }
  if (!latest)
    yield withFrontier(
      { done: true as const, result: err<Issues, T>([emptyStreamIssue]) },
      [],
      false,
    );
  else if (!latest.complete)
    yield withFrontier(
      { done: true as const, result: err<Issues, T>([openStreamIssue]) },
      latest.openPath,
      latest.tailOpen,
    );
  else
    yield withFrontier(
      { done: true as const, result: await parseAsync(schema, latest.value) },
      [],
      false,
    );
}
