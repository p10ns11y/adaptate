import {
  isStandardSchema,
  validateAgainstStandardSchemas,
  validateStandard,
} from "@adaptate/core/standard";

const probe = {
  "~standard": {
    version: 1,
    vendor: "adaptate-bench",
    validate: (value) => ({ value }),
  },
};

export function run(value) {
  return validateAgainstStandardSchemas(value, { probe });
}

export const ready =
  isStandardSchema(probe) && typeof validateStandard === "function" && typeof run === "function";
