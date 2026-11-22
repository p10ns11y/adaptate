import {
  orderDocument,
  orderSchema,
  orderViewConfigs,
  receiptConfig,
} from "./order.js";

const configs = { receipt: receiptConfig };
const toolCallId = "call_order";

export function createAdaptateApp(zod, adaptateCore, adaptateStream) {
  const base = orderSchema(zod, "partial");
  const strict = adaptateCore.transformSchema(base, receiptConfig);
  const viewSchemas = orderViewConfigs.map((viewConfig) =>
    adaptateCore.transformSchema(base, viewConfig),
  );
  const validator = adaptateStream.createStreamValidator(base, configs);
  return {
    name: "adaptate",
    validateFull(document = orderDocument) {
      return strict.safeParse(document).success;
    },
    validateViews(document = orderDocument) {
      let readyViews = 0;
      for (const viewSchema of viewSchemas) {
        if (viewSchema.safeParse(document).success) readyViews += 1;
      }
      return readyViews === viewSchemas.length;
    },
    validatePartial(document) {
      if (document === undefined) return undefined;
      return validator.partial(document).receipt.valid;
    },
    openStream() {
      const push = adaptateStream.createAgUiPartialValidator(base, configs);
      return (delta) => {
        const outcome = push({
          type: "TOOL_CALL_ARGS",
          toolCallId,
          delta,
        });
        if (outcome === undefined) return undefined;
        return outcome.results.receipt.valid;
      };
    },
    repairStream() {
      const buffers = new Map();
      return (delta) => {
        const text = (buffers.get(toolCallId) ?? "") + delta;
        buffers.set(toolCallId, text);
        return adaptateStream.parsePartialJson(text);
      };
    },
    readStream() {
      const push = adaptateStream.createAgUiPartialValidator(base, configs);
      return (delta) =>
        push({
          type: "TOOL_CALL_ARGS",
          toolCallId,
          delta,
        });
    },
  };
}
