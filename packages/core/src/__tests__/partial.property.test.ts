import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { z } from "zod";

import { transformPartialSchema } from "../";
import { parsePartialJson, createStreamValidator } from "../stream";

const schema = z.object({
  title: z.string(),
  count: z.number(),
  done: z.boolean().optional(),
  meta: z
    .object({ owner: z.string(), score: z.number().optional() })
    .optional(),
  items: z.array(z.object({ name: z.string(), qty: z.number() })),
});

const configs = {
  card: { title: true, count: true },
  owner: { meta: { owner: true } },
  rows: { items: { "*": { name: true, qty: true } } },
};

const finite = fc.double({
  noNaN: true,
  noDefaultInfinity: true,
  min: -1e6,
  max: 1e6,
});

const valid = fc.record(
  {
    title: fc.string(),
    count: finite,
    done: fc.boolean(),
    meta: fc.record(
      { owner: fc.string(), score: finite },
      { requiredKeys: ["owner"] },
    ),
    items: fc.array(fc.record({ name: fc.string(), qty: finite }), {
      maxLength: 4,
    }),
  },
  { requiredKeys: ["title", "count", "items"] },
);

function dropKeys(value: unknown, mask: boolean[], index = { i: 0 }): unknown {
  if (Array.isArray(value))
    return value.map((element) => dropKeys(element, mask, index));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(() => mask[index.i++ % mask.length] !== false)
      .map(([key, field]) => [key, dropKeys(field, mask, index)]),
  );
}

describe("streaming partial properties", () => {
  it("never rejects any key subset of a valid final", () => {
    fc.assert(
      fc.property(
        valid,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 16 }),
        (final, mask) => {
          const partial = dropKeys(final, mask) as never;
          for (const config of Object.values(configs)) {
            expect(
              transformPartialSchema(schema, config)(partial).safeParse(partial)
                .success,
            ).toBe(true);
          }
        },
      ),
    );
  });

  it("never rejects any streamed JSON prefix of a valid final", () => {
    fc.assert(
      fc.property(valid, (final) => {
        const validator = createStreamValidator(schema, configs);
        const text = JSON.stringify(final);
        for (let end = 1; end < text.length; end += 1) {
          const partial = parsePartialJson(text.slice(0, end));
          if (typeof partial !== "object" || partial === null) continue;
          for (const result of Object.values(
            validator.partial(partial as never),
          )) {
            expect(result.valid).toBe(true);
          }
        }
        expect(parsePartialJson(text)).toEqual(JSON.parse(text));
        const finals = validator.final(final);
        expect(finals.card.valid && finals.rows.valid).toBe(true);
        expect(finals.owner.valid).toBe(final.meta !== undefined);
      }),
      { numRuns: 60 },
    );
  }, 30_000);

  it("rejects a present field of the wrong type in every config", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.boolean(), fc.constant(null), fc.array(fc.integer())),
        (wrong) => {
          const partial = { count: wrong } as never;
          for (const config of Object.values(configs)) {
            expect(
              transformPartialSchema(schema, config)(partial).safeParse(partial)
                .success,
            ).toBe(false);
          }
        },
      ),
    );
  });
});
