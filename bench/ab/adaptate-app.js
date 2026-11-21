import { orderDocument, orderSchema, receiptConfig } from "./order.js";

const configs = { receipt: receiptConfig };
const toolCallId = "call_order";

export function createAdaptateApp(zod, adaptateCore, adaptateStream) {
  const base = orderSchema(zod, "partial");
  const strict = adaptateCore.transformSchema(base, receiptConfig);
  const validator = adaptateStream.createStreamValidator(base, configs);
  return {
    name: "adaptate",
    validateFull(document = orderDocument) {
      return strict.safeParse(document).success;
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
