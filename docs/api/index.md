---
title: "API"
description: "API reference generated from the published declaration files."
---

# API

Generated from the `.d.ts` files that ship in `@adaptate/core` and `@adaptate/utils`. Regenerate with `pnpm build` and then `pnpm docs:api`.

## @adaptate/core

- [Class: AdaptateParseError](core/effect/classes/AdaptateParseError.md): Exported from @adaptate/core/effect.
- [Class: AdaptateValidationError](core/effect/classes/AdaptateValidationError.md): Exported from @adaptate/core/effect.
- [Function: createEffectStreamValidator()](core/effect/functions/createEffectStreamValidator.md): Exported from @adaptate/core/effect.
- [Function: validate()](core/effect/functions/validate.md): Exported from @adaptate/core/effect.
- [Function: validatePartial()](core/effect/functions/validatePartial.md): Exported from @adaptate/core/effect.
- [Type Alias: ConfigReport](core/effect/type-aliases/ConfigReport.md): Exported from @adaptate/core/effect.
- [Type Alias: FinalReport\<TValue, TConfigs\>](core/effect/type-aliases/FinalReport.md): Exported from @adaptate/core/effect.
- [Function: makeConditionalSchemaTransformer()](core/index/functions/makeConditionalSchemaTransformer.md): Exported from @adaptate/core.
- [Function: makeStreamingConditionalTransformer()](core/index/functions/makeStreamingConditionalTransformer.md): Exported from @adaptate/core.
- [Function: transformPartialSchema()](core/index/functions/transformPartialSchema.md): Exported from @adaptate/core.
- [Function: transformSchema()](core/index/functions/transformSchema.md): Make fields required/optional based on config. Returns a properly typed Zod schema.
- [Function: validatePartialAgainstConfigs()](core/index/functions/validatePartialAgainstConfigs.md): Exported from @adaptate/core.
- [Type Alias: Config\<T\>](core/index/type-aliases/Config.md): Type-safe configuration for `transformSchema` and conditional transformers.
- [Type Alias: DeepPartial\<T\>](core/index/type-aliases/DeepPartial.md): Exported from @adaptate/core.
- [Type Alias: PartialValidationResult](core/index/type-aliases/PartialValidationResult.md): Exported from @adaptate/core.
- [Function: isStandardSchema()](core/standard/functions/isStandardSchema.md): Exported from @adaptate/core/standard.
- [Function: validateAgainstStandardSchemas()](core/standard/functions/validateAgainstStandardSchemas.md): Exported from @adaptate/core/standard.
- [Function: validateStandard()](core/standard/functions/validateStandard.md): Exported from @adaptate/core/standard.
- [Interface: StandardSchemaV1\<Input, Output\>](core/standard/interfaces/StandardSchemaV1.md): Exported from @adaptate/core/standard.
- [Type Alias: StandardIssue](core/standard/type-aliases/StandardIssue.md): Exported from @adaptate/core/standard.
- [Type Alias: StandardResult\<Output\>](core/standard/type-aliases/StandardResult.md): Exported from @adaptate/core/standard.
- [Type Alias: StandardValidationResult\<Output\>](core/standard/type-aliases/StandardValidationResult.md): Exported from @adaptate/core/standard.
- [Function: createAgUiPartialValidator()](core/stream-incremental/functions/createAgUiPartialValidator.md): Exported from @adaptate/core/stream-incremental.
- [Function: createPartialJsonParser()](core/stream-incremental/functions/createPartialJsonParser.md): Exported from @adaptate/core/stream-incremental.
- [Type Alias: PartialJsonParser](core/stream-incremental/type-aliases/PartialJsonParser.md): Exported from @adaptate/core/stream-incremental.
- [Function: createAgUiPartialValidator()](core/stream/functions/createAgUiPartialValidator.md): Exported from @adaptate/core/stream.
- [Function: createFrameThrottle()](core/stream/functions/createFrameThrottle.md): Exported from @adaptate/core/stream.
- [Function: createStreamValidator()](core/stream/functions/createStreamValidator.md): Exported from @adaptate/core/stream.
- [Function: parsePartialJson()](core/stream/functions/parsePartialJson.md): Exported from @adaptate/core/stream.
- [Function: validateStructuredOutput()](core/stream/functions/validateStructuredOutput.md): Exported from @adaptate/core/stream.
- [Type Alias: AgUiDeltaEvent](core/stream/type-aliases/AgUiDeltaEvent.md): Exported from @adaptate/core/stream.

## @adaptate/utils

- [Function: fetchYamlContent()](utils/openapi/functions/fetchYamlContent.md): Exported from @adaptate/utils/openapi.
- [Function: getDereferencedOpenAPIDocument()](utils/openapi/functions/getDereferencedOpenAPIDocument.md): Exported from @adaptate/utils/openapi.
- [Function: getYamlContent()](utils/openapi/functions/getYamlContent.md): Exported from @adaptate/utils/openapi.
- [Function: openAPISchemaToZod()](utils/openapi/functions/openAPISchemaToZod.md): Converts an OpenAPI / JSON Schema object to a Zod schema. Supports a wide range of features for feature-completeness: - Primitives: string, number, integer, boolean - Complex: o...
- [Function: zodToOpenAPISchema()](utils/openapi/functions/zodToOpenAPISchema.md): Converts a Zod schema to an OpenAPI / JSON Schema compatible object. Now feature-complete with: - Proper `required` array for objects (excludes .optional() fields) - Support for...
- [Type Alias: BrowserOpenAPISpecParams](utils/openapi/type-aliases/BrowserOpenAPISpecParams.md): Exported from @adaptate/utils/openapi.
- [Type Alias: OpenAPISpecParams](utils/openapi/type-aliases/OpenAPISpecParams.md): Exported from @adaptate/utils/openapi.
- [Type Alias: ServerOpenAPISpecParams](utils/openapi/type-aliases/ServerOpenAPISpecParams.md): Exported from @adaptate/utils/openapi.
