import { describe, it, expect } from "vitest";
import { z } from "zod";

import { transformSchema } from "../";
import {
  isStandardSchema,
  validateStandard,
  validateAgainstStandardSchemas,
  type StandardSchemaV1,
} from "../standard";

const positive: StandardSchemaV1<unknown, number> = {
  "~standard": {
    version: 1,
    vendor: "hand",
    validate: (value) =>
      typeof value === "number" && value > 0
        ? { value }
        : { issues: [{ message: "must be positive", path: [] }] },
  },
};

const asyncPositive: StandardSchemaV1<unknown, number> = {
  "~standard": {
    ...positive["~standard"],
    validate: async (value) => positive["~standard"].validate(value),
  },
};

describe("standard schema interop", () => {
  it("detects standard schemas, including adaptate transformed zod schemas", () => {
    const transformed = transformSchema(
      z.object({ name: z.string().optional() }),
      { name: true },
    );
    expect(isStandardSchema(transformed)).toBe(true);
    expect(isStandardSchema(positive)).toBe(true);
    expect(isStandardSchema(null)).toBe(false);
    expect(isStandardSchema({ "~standard": {} })).toBe(false);
  });

  it("validates with any vendor, sync or async", async () => {
    expect(await validateStandard(positive, 2)).toEqual({
      valid: true,
      value: 2,
      issues: null,
    });
    expect(await validateStandard(asyncPositive, -1)).toEqual({
      valid: false,
      value: null,
      issues: [{ message: "must be positive", path: [] }],
    });
  });

  it("validates a value against named consumer schemas", async () => {
    const transformed = transformSchema(
      z.object({ name: z.string().optional() }),
      { name: true },
    );
    const results = await validateAgainstStandardSchemas(
      { name: "Ada" },
      { form: transformed, count: positive },
    );
    expect(results.form).toEqual({
      valid: true,
      value: { name: "Ada" },
      issues: null,
    });
    expect(results.count.valid).toBe(false);
  });
});
