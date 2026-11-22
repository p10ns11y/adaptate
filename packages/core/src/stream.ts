import { z } from "zod";

import { transformSchema, type Config } from "./index.js";
import {
  schemasForConfigs,
  validatePartialAgainstConfigs,
  type DeepPartial,
  type PartialValidationResult,
} from "./partial.js";
import {
  createPartialJsonFeed,
  createPartialJsonParser,
  type PartialJsonParser,
} from "./partial-json.js";

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
  const prepared = schemasForConfigs(schema, configs, transformSchema);
  return {
    partial(value: DeepPartial<z.infer<TSchema>>): Results<TConfigs> {
      return validatePartialAgainstConfigs(schema, value, configs);
    },
    final(value: unknown): Results<TConfigs> {
      return Object.fromEntries(
        Object.entries(configs).map(([name, config]) => {
          const transformed =
            prepared[name] ??
            transformSchema(schema, config as Config<z.infer<TSchema>>);
          const result = transformed.safeParse(value);
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

type AgUiSlot<TConfigs> = [
  (chunk: string) => unknown,
  unknown,
  Results<TConfigs> | undefined,
];

export function createAgUiPartialValidator<
  TSchema extends z.ZodType,
  TConfigs extends Record<string, Config<DeepPartial<z.infer<TSchema>>>>,
>(schema: TSchema, configs: TConfigs) {
  const validator = createStreamValidator(schema, configs);
  const slots = new Map<string, AgUiSlot<TConfigs>>();
  return function push(event: AgUiDeltaEvent) {
    const id =
      event.type === "TOOL_CALL_ARGS"
        ? event.toolCallId
        : event.type === "TEXT_MESSAGE_CONTENT"
          ? event.messageId
          : undefined;
    if (id === undefined || typeof event.delta !== "string") return undefined;
    let slot = slots.get(id);
    if (!slot) {
      slot = [createPartialJsonFeed(), undefined, undefined];
      slots.set(id, slot);
    }
    const value = slot[0](event.delta);
    if (value === undefined) return undefined;
    if (value !== slot[1]) {
      slot[1] = value;
      slot[2] = validator.partial(value as DeepPartial<z.infer<TSchema>>);
    }
    return {
      id,
      partial: value as DeepPartial<z.infer<TSchema>>,
      results: slot[2] as Results<TConfigs>,
    };
  };
}

type FrameClock = (callback: () => void) => number;

function frameClock(): FrameClock {
  const requestFrame = (
    globalThis as { requestAnimationFrame?: FrameClock }
  ).requestAnimationFrame;
  if (typeof requestFrame === "function") {
    return (callback) => requestFrame(callback);
  }
  return (callback) => setTimeout(callback, 0) as unknown as number;
}

export function createFrameThrottle<T>(emit: (value: T) => void): (value: T) => void {
  let latest: T | undefined;
  let pending = false;
  const clock = frameClock();
  return function pushFrame(value: T) {
    latest = value;
    if (pending) return;
    pending = true;
    clock(() => {
      pending = false;
      emit(latest as T);
    });
  };
}

export { createPartialJsonParser, type PartialJsonParser };
