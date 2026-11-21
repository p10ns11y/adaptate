import { Data, Effect, Stream } from "effect";
import { z } from "zod";

import { transformSchema, type Config } from "./index";
import {
  validatePartialAgainstConfigs,
  type DeepPartial,
  type PartialValidationResult,
} from "./partial";
import {
  createAgUiPartialValidator,
  createStreamValidator,
  type AgUiDeltaEvent,
} from "./stream";

export class AdaptateValidationError extends Data.TaggedError(
  "AdaptateValidationError",
)<{
  readonly configName: string;
  readonly issues: ReadonlyArray<z.core.$ZodIssue>;
}> {}

export class AdaptateParseError extends Data.TaggedError("AdaptateParseError")<{
  readonly text: string;
}> {}

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
        issues: cause instanceof z.ZodError ? cause.issues : [],
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
    catch: () =>
      new AdaptateValidationError({
        configName: "partial",
        issues: [],
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
  return {
    partial(
      value: DeepPartial<z.infer<TSchema>>,
    ): Effect.Effect<
      { [K in keyof TConfigs]: PartialValidationResult },
      never
    > {
      return Effect.succeed(validator.partial(value));
    },
    final(
      text: string,
    ): Effect.Effect<
      z.infer<TSchema>,
      AdaptateParseError | AdaptateValidationError
    > {
      return Effect.try({
        try: () => JSON.parse(text) as unknown,
        catch: () => new AdaptateParseError({ text }),
      }).pipe(
        Effect.flatMap((parsed) => {
          const namedConfigs = Object.entries(configs);
          if (namedConfigs.length === 0) {
            return strictParse(schema, undefined, "schema", parsed);
          }
          const firstNamedConfig = namedConfigs[0];
          const restConfigs = namedConfigs.slice(1);
          return Effect.gen(function* () {
            let validated = yield* strictParse(
              schema,
              firstNamedConfig[1] as Config<z.infer<TSchema>>,
              firstNamedConfig[0],
              parsed,
            );
            for (const [configName, config] of restConfigs) {
              validated = yield* strictParse(
                schema,
                config as Config<z.infer<TSchema>>,
                configName,
                parsed,
              );
            }
            return validated;
          });
        }),
      );
    },
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
