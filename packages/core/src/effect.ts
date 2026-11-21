import { Data, Effect, Stream } from "effect";
import { z } from "zod";

import { transformSchema, type Config } from "./index.js";
import {
  validatePartialAgainstConfigs,
  type DeepPartial,
  type PartialValidationResult,
} from "./partial.js";
import {
  createAgUiPartialValidator,
  createStreamValidator,
  type AgUiDeltaEvent,
} from "./stream.js";

export class AdaptateValidationError extends Data.TaggedError(
  "AdaptateValidationError",
)<{
  readonly configName: string;
  readonly issues: ReadonlyArray<z.core.$ZodIssue>;
}> {}

export class AdaptateParseError extends Data.TaggedError("AdaptateParseError")<{
  readonly text: string;
}> {}

export type ConfigReport = {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<z.core.$ZodIssue> | null;
};

export type FinalReport<TValue, TConfigs> = {
  readonly value: TValue;
  readonly configs: { [K in keyof TConfigs]: ConfigReport };
};

function issuesFromCause(cause: unknown): ReadonlyArray<z.core.$ZodIssue> {
  if (cause instanceof z.ZodError) {
    return cause.issues;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return [{ code: "custom", message, path: [] }];
}

function strictParse<TSchema extends z.ZodType>(
  schema: TSchema,
  config: Config<z.infer<TSchema>> | undefined,
  configName: string,
  value: unknown,
): Effect.Effect<z.infer<TSchema>, AdaptateValidationError> {
  return Effect.try({
    try: () => {
      const activeSchema =
        config === undefined ? schema : transformSchema(schema, config);
      return activeSchema.parse(value);
    },
    catch: (cause) =>
      new AdaptateValidationError({
        configName,
        issues: issuesFromCause(cause),
      }),
  });
}

function parseDocument(text: string): Effect.Effect<unknown, AdaptateParseError> {
  return Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: () => new AdaptateParseError({ text }),
  });
}

function reportsForConfigs<
  TSchema extends z.ZodType,
  TConfigs extends Record<string, Config<DeepPartial<z.infer<TSchema>>>>,
>(
  schema: TSchema,
  configs: TConfigs,
  parsed: unknown,
): Effect.Effect<
  { [K in keyof TConfigs]: ConfigReport },
  AdaptateValidationError
> {
  return Effect.try({
    try: () => {
      const entries = Object.entries(configs).map(([configName, config]) => {
        const result = transformSchema(
          schema,
          config as Config<z.infer<TSchema>>,
        ).safeParse(parsed);
        const report: ConfigReport = result.success
          ? { valid: true, issues: null }
          : { valid: false, issues: result.error.issues };
        return [configName, report] as const;
      });
      return Object.fromEntries(entries) as {
        [K in keyof TConfigs]: ConfigReport;
      };
    },
    catch: (cause) =>
      new AdaptateValidationError({
        configName: "schema",
        issues: issuesFromCause(cause),
      }),
  });
}

export function validate<
  TSchema extends z.ZodType,
  TConfig extends Config<z.infer<TSchema>>,
>(
  schema: TSchema,
  config: TConfig,
  value: unknown,
): Effect.Effect<z.infer<TSchema>, AdaptateValidationError> {
  return strictParse(schema, config, "config", value);
}

export function validatePartial<
  TSchema extends z.ZodType,
  TConfigs extends Record<string, Config<DeepPartial<z.infer<TSchema>>>>,
>(
  schema: TSchema,
  configs: TConfigs,
  partial: DeepPartial<z.infer<TSchema>>,
): Effect.Effect<DeepPartial<z.infer<TSchema>>, AdaptateValidationError> {
  return Effect.try({
    try: () => validatePartialAgainstConfigs(schema, partial, configs),
    catch: (cause) =>
      new AdaptateValidationError({
        configName: "partial",
        issues: issuesFromCause(cause),
      }),
  }).pipe(
    Effect.flatMap((results) => {
      for (const [configName, result] of Object.entries(results)) {
        if (result.errors) {
          return Effect.fail(
            new AdaptateValidationError({
              configName,
              issues: result.errors.issues,
            }),
          );
        }
      }
      return Effect.succeed(partial);
    }),
  );
}

export function createEffectStreamValidator<
  TSchema extends z.ZodType,
  TConfigs extends Record<string, Config<DeepPartial<z.infer<TSchema>>>>,
>(schema: TSchema, configs: TConfigs) {
  const validator = createStreamValidator(schema, configs);
  const pushAgUi = createAgUiPartialValidator(schema, configs);
  function final(
    text: string,
  ): Effect.Effect<
    FinalReport<z.infer<TSchema>, TConfigs>,
    AdaptateParseError | AdaptateValidationError
  >;
  function final(
    text: string,
    configName: keyof TConfigs,
  ): Effect.Effect<
    z.infer<TSchema>,
    AdaptateParseError | AdaptateValidationError
  >;
  function final(
    text: string,
    configName?: keyof TConfigs,
  ): Effect.Effect<
    | z.infer<TSchema>
    | FinalReport<z.infer<TSchema>, TConfigs>,
    AdaptateParseError | AdaptateValidationError
  > {
    return Effect.gen(function* () {
      const parsed = yield* parseDocument(text);
      if (configName !== undefined) {
        if (!Object.hasOwn(configs, configName)) {
          return yield* Effect.fail(
            new AdaptateValidationError({
              configName: String(configName),
              issues: [
                {
                  code: "custom",
                  message: "unknown config",
                  path: [],
                },
              ],
            }),
          );
        }
        return yield* strictParse(
          schema,
          configs[configName] as Config<z.infer<TSchema>>,
          String(configName),
          parsed,
        );
      }
      const value = yield* strictParse(schema, undefined, "schema", parsed);
      const namedReports = yield* reportsForConfigs(schema, configs, parsed);
      return { value, configs: namedReports };
    });
  }
  return {
    partial(
      value: DeepPartial<z.infer<TSchema>>,
    ): Effect.Effect<
      { [K in keyof TConfigs]: PartialValidationResult },
      never
    > {
      return Effect.succeed(validator.partial(value));
    },
    final,
    agUi(event: AgUiDeltaEvent) {
      return Effect.sync(() => pushAgUi(event));
    },
    agUiStream<E, R>(events: Stream.Stream<AgUiDeltaEvent, E, R>) {
      const pushEvent = createAgUiPartialValidator(schema, configs);
      return Stream.mapEffect(
        events,
        (event) => Effect.sync(() => pushEvent(event)),
        { concurrency: 1 },
      );
    },
  };
}
