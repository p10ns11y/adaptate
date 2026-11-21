import { z } from "zod";

import { transformSchema, type Config } from "./index.js";
import {
  validatePartialAgainstConfigs,
  type DeepPartial,
  type PartialValidationResult,
} from "./partial.js";

type Results<TConfigs> = { [K in keyof TConfigs]: PartialValidationResult };

function completeJson(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if (char === "}" || char === "]") stack.pop();
  }
  let body = text;
  if (inString) body = (escaped ? body.slice(0, -1) : body) + '"';
  body = body.replace(/[\s,:]+$/, "");
  return body + stack.reverse().join("");
}

export function parsePartialJson(text: string): unknown {
  for (let end = text.length; end > 0; end -= 1) {
    try {
      return JSON.parse(completeJson(text.slice(0, end)));
    } catch {
      continue;
    }
  }
  return undefined;
}

export function createStreamValidator<
  TSchema extends z.ZodType,
  TConfigs extends Record<string, Config<DeepPartial<z.infer<TSchema>>>>,
>(schema: TSchema, configs: TConfigs) {
  return {
    partial(value: DeepPartial<z.infer<TSchema>>): Results<TConfigs> {
      return validatePartialAgainstConfigs(schema, value, configs);
    },
    final(value: unknown): Results<TConfigs> {
      return Object.fromEntries(
        Object.entries(configs).map(([name, config]) => {
          const result = transformSchema(
            schema,
            config as Config<z.infer<TSchema>>,
          ).safeParse(value);
          return [
            name,
            {
              valid: result.success,
              errors: result.success ? null : result.error,
            },
          ];
        }),
      ) as Results<TConfigs>;
    },
  };
}

export function validateStructuredOutput<
  TSchema extends z.ZodType,
  TConfigs extends Record<string, Config<DeepPartial<z.infer<TSchema>>>>,
>(
  output: {
    partial?: DeepPartial<z.infer<TSchema>> | null;
    final?: z.infer<TSchema> | null;
  },
  schema: TSchema,
  configs: TConfigs,
) {
  const validator = createStreamValidator(schema, configs);
  return {
    partial: output.partial == null ? null : validator.partial(output.partial),
    final: output.final == null ? null : validator.final(output.final),
  };
}

export type AgUiDeltaEvent = {
  type: string;
  delta?: string;
  toolCallId?: string;
  messageId?: string;
};

export function createAgUiPartialValidator<
  TSchema extends z.ZodType,
  TConfigs extends Record<string, Config<DeepPartial<z.infer<TSchema>>>>,
>(schema: TSchema, configs: TConfigs) {
  const validator = createStreamValidator(schema, configs);
  const buffers = new Map<string, string>();
  return function push(event: AgUiDeltaEvent) {
    const id =
      event.type === "TOOL_CALL_ARGS"
        ? event.toolCallId
        : event.type === "TEXT_MESSAGE_CONTENT"
          ? event.messageId
          : undefined;
    if (id === undefined || typeof event.delta !== "string") return undefined;
    const text = (buffers.get(id) ?? "") + event.delta;
    buffers.set(id, text);
    const partial = parsePartialJson(text);
    if (partial === undefined) return undefined;
    return {
      id,
      partial: partial as DeepPartial<z.infer<TSchema>>,
      results: validator.partial(partial as DeepPartial<z.infer<TSchema>>),
    };
  };
}
