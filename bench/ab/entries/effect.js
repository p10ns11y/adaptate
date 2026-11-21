import {
  createEffectStreamValidator,
  validatePartial,
} from "@adaptate/core/effect";

export function hold(schema, configs, partial) {
  return {
    partial: validatePartial(schema, configs, partial),
    stream: createEffectStreamValidator(schema, configs),
  };
}

export const ready =
  typeof validatePartial === "function" &&
  typeof createEffectStreamValidator === "function" &&
  typeof hold === "function";
