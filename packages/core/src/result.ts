import type { StandardIssue, StandardSchemaV1 } from "./standard.js";
import {
  fromAsyncIterableSteps,
  type JsonStreamStep,
} from "./stream-incremental.js";

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

export function ok<T, E = never>(value: T): Ok<T, E> {
  return {
    ok: true,
    value,
    map: (transform) => ok(transform(value)),
    flatMap: (next) => next(value),
    mapError: () => ok(value),
    recover: () => ok(value),
    match: (onOk) => onOk(value),
  };
}

export function err<E, T = never>(error: E): Err<E, T> {
  return {
    ok: false,
    error,
    map: () => err(error),
    flatMap: () => err(error),
    mapError: (transform) => err(transform(error)),
    recover: (fallback) => ok(fallback(error)),
    match: (_onOk, onErr) => onErr(error),
  };
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

export type StreamStep<T, P> =
  | { readonly done: false; readonly result: Result<P> }
  | { readonly done: true; readonly result: Result<T> };

const emptyStreamIssue: StandardIssue = {
  message: "The stream ended before any JSON value arrived.",
};
const openStreamIssue: StandardIssue = {
  message: "The stream ended before the JSON value closed.",
};

export async function* parseStream<T, P = unknown>(
  source: AsyncIterable<string | Uint8Array>,
  schema: StandardSchemaV1<unknown, T>,
  partialSchema?: StandardSchemaV1<unknown, P>,
): AsyncGenerator<StreamStep<T, P>> {
  let latest: JsonStreamStep | undefined;
  for await (const step of fromAsyncIterableSteps(source)) {
    latest = step;
    const result = partialSchema
      ? await parseAsync(partialSchema, step.value)
      : ok(step.value as P);
    yield { done: false, result };
  }
  if (!latest) yield { done: true, result: err([emptyStreamIssue]) };
  else if (!latest.complete)
    yield { done: true, result: err([openStreamIssue]) };
  else yield { done: true, result: await parseAsync(schema, latest.value) };
}
