import type { StandardIssue, StandardSchemaV1 } from "./standard.js";
import { fromAsyncIterable } from "./stream-incremental.js";

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

export function parse<T>(schema: StandardSchemaV1<unknown, T>, input: unknown): Result<T> {
  const checked = schema["~standard"].validate(input);
  if (checked instanceof Promise) return err([asyncSchemaIssue]);
  return checked.issues ? err(checked.issues) : ok(checked.value);
}

export async function parseAsync<T>(schema: StandardSchemaV1<unknown, T>, input: unknown): Promise<Result<T>> {
  const checked = await schema["~standard"].validate(input);
  return checked.issues ? err(checked.issues) : ok(checked.value);
}

export type StreamStep<T, P> =
  | { readonly done: false; readonly result: Result<P> }
  | { readonly done: true; readonly result: Result<T> };

const emptyStreamIssue: StandardIssue = { message: "The stream ended before any JSON value arrived." };

export async function* parseStream<T, P = unknown>(
  source: AsyncIterable<string | Uint8Array>,
  schema: StandardSchemaV1<unknown, T>,
  partialSchema?: StandardSchemaV1<unknown, P>,
): AsyncGenerator<StreamStep<T, P>> {
  let latest: { value: unknown } | undefined;
  for await (const partialValue of fromAsyncIterable(source)) {
    latest = { value: partialValue };
    const result = partialSchema ? await parseAsync(partialSchema, partialValue) : ok(partialValue as P);
    yield { done: false, result };
  }
  yield { done: true, result: latest ? await parseAsync(schema, latest.value) : err([emptyStreamIssue]) };
}
