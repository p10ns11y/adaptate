import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  applyOpenApiStringFormatFromDef,
  coalesceZodObjectShape,
  getSchemaChecks,
  isZodStringLike,
  mergeArrayLengthChecksIntoOpenApi,
  mergeNullableOpenApiFragment,
  mergeNumberChecksIntoOpenApi,
  mergeStringChecksIntoOpenApi,
  schemaIndicatesInteger,
  unwrapOptional,
} from '../openapi-zod-checks';

describe('unwrapOptional', () => {
  it('returns inner schema when optional uses unwrap()', () => {
    let optional = z.string().optional();
    let { inner, isOptional } = unwrapOptional(optional);
    expect(isOptional).toBe(true);
    expect(inner).toBeDefined();
    expect(inner instanceof z.ZodString).toBe(true);
  });

  it('falls back to _def.innerType when unwrap is missing (compat)', () => {
    let optional = z.string().optional();
    delete (optional as any).unwrap;
    let result = unwrapOptional(optional);
    expect(result.isOptional).toBe(true);
    expect(result.inner instanceof z.ZodString).toBe(true);
  });

  it('returns the same schema when not optional', () => {
    let plain = z.boolean();
    let { inner, isOptional } = unwrapOptional(plain);
    expect(isOptional).toBe(false);
    expect(inner).toBe(plain);
  });
});

describe('isZodStringLike', () => {
  it('recognizes ZodString and Zod 4 string-shaped schemas', () => {
    expect(isZodStringLike(z.string())).toBe(true);
    expect(isZodStringLike(z.email())).toBe(true);
    expect(isZodStringLike(z.number())).toBe(false);
  });
});

describe('getSchemaChecks', () => {
  it('prefers _zod.def.checks when present', () => {
    let schema = z.string().min(2);
    let checks = getSchemaChecks(schema);
    expect(checks.length).toBeGreaterThan(0);
  });

  it('falls back to _def.checks when _zod checks are absent', () => {
    let schema = {} as z.ZodType;
    let legacyChecks = [{ kind: 'min', value: 1 }];
    (schema as any)._def = { checks: legacyChecks };
    expect(getSchemaChecks(schema)).toEqual(legacyChecks);
  });

  it('returns an empty array when no checks exist', () => {
    let bare = {} as z.ZodType;
    expect(getSchemaChecks(bare)).toEqual([]);
  });
});

describe('applyOpenApiStringFormatFromDef', () => {
  it.each([
    ['email', 'email'],
    ['uuid', 'uuid'],
    ['guid', 'uuid'],
    ['url', 'uri'],
    ['datetime', 'date-time'],
    ['date', 'date'],
    ['time', 'time'],
  ] as const)('maps format %s to OpenAPI fragment', (format, expected) => {
    let result: Record<string, any> = {};
    applyOpenApiStringFormatFromDef(result, format);
    expect(result.format).toBe(expected);
  });

  it('ignores unknown formats without throwing', () => {
    let result: Record<string, any> = {};
    applyOpenApiStringFormatFromDef(result, 'password');
    expect(result).toEqual({});
  });
});

describe('mergeStringChecksIntoOpenApi (legacy check.kind)', () => {
  it.each([
    ['min', { minLength: 2 }],
    ['max', { maxLength: 9 }],
    ['regex', { pattern: '^x$' }],
    ['email', { format: 'email' }],
    ['uuid', { format: 'uuid' }],
    ['url', { format: 'uri' }],
    ['datetime', { format: 'date-time' }],
    ['date', { format: 'date' }],
  ] as const)('maps legacy kind %s', (kind, expectedSubset) => {
    let result: Record<string, any> = {};
    let check: any = { kind };
    if (kind === 'min' || kind === 'max') {
      check.value = kind === 'min' ? 2 : 9;
    }
    if (kind === 'regex') {
      check.regex = /^x$/;
    }
    mergeStringChecksIntoOpenApi(result, check);
    expect(result).toMatchObject(expectedSubset);
  });

  it('uses regex.toString when source is unavailable', () => {
    let result: Record<string, any> = {};
    mergeStringChecksIntoOpenApi(result, {
      kind: 'regex',
      regex: { toString: () => '/fallback/' },
    });
    expect(result.pattern).toBe('/fallback/');
  });

  it('ignores unknown legacy kinds', () => {
    let result: Record<string, any> = { type: 'string' };
    mergeStringChecksIntoOpenApi(result, { kind: 'endsWith', value: '.txt' });
    expect(result).toEqual({ type: 'string' });
  });
});

describe('mergeStringChecksIntoOpenApi (Zod 4 _zod.def)', () => {
  it('maps min_length and max_length', () => {
    let result: Record<string, any> = {};
    mergeStringChecksIntoOpenApi(result, {
      _zod: { def: { check: 'min_length', minimum: 3 } },
    });
    mergeStringChecksIntoOpenApi(result, {
      _zod: { def: { check: 'max_length', maximum: 10 } },
    });
    expect(result.minLength).toBe(3);
    expect(result.maxLength).toBe(10);
  });

  it('maps string_format regex patterns', () => {
    let result: Record<string, any> = {};
    mergeStringChecksIntoOpenApi(result, {
      _zod: {
        def: { check: 'string_format', format: 'regex', pattern: /^[a-z]+$/ },
      },
    });
    expect(result.pattern).toBe('^[a-z]+$');
  });

  it('stringifies non-RegExp pattern values defensively', () => {
    let result: Record<string, any> = {};
    mergeStringChecksIntoOpenApi(result, {
      _zod: {
        def: {
          check: 'string_format',
          format: 'regex',
          pattern: { source: 123 as unknown as string },
        },
      },
    });
    expect(result.pattern).toBe('[object Object]');
  });

  it('delegates non-regex string_format values to applyOpenApiStringFormatFromDef', () => {
    let result: Record<string, any> = {};
    mergeStringChecksIntoOpenApi(result, {
      _zod: { def: { check: 'string_format', format: 'email' } },
    });
    expect(result.format).toBe('email');
  });

  it('returns early when check metadata is missing', () => {
    let result: Record<string, any> = { keep: true };
    mergeStringChecksIntoOpenApi(result, {});
    mergeStringChecksIntoOpenApi(result, { _zod: { def: {} } });
    expect(result).toEqual({ keep: true });
  });

  it('ignores unknown Zod check names', () => {
    let result: Record<string, any> = {};
    mergeStringChecksIntoOpenApi(result, {
      _zod: { def: { check: 'custom_future_check' } },
    });
    expect(result).toEqual({});
  });
});

describe('schemaIndicatesInteger', () => {
  it('detects legacy int checks', () => {
    let schema = { _zod: { def: { checks: [{ kind: 'int' }] } } } as unknown as z.ZodNumber;
    expect(schemaIndicatesInteger(schema)).toBe(true);
  });

  it('detects Zod 4 safeint number_format', () => {
    expect(schemaIndicatesInteger(z.number().int())).toBe(true);
  });

  it('returns false for plain numbers', () => {
    expect(schemaIndicatesInteger(z.number())).toBe(false);
  });
});

describe('mergeNumberChecksIntoOpenApi (legacy check.kind)', () => {
  it('maps inclusive min/max and multipleOf', () => {
    let result: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(result, { kind: 'min', value: 1, inclusive: true });
    mergeNumberChecksIntoOpenApi(result, { kind: 'max', value: 9, inclusive: true });
    mergeNumberChecksIntoOpenApi(result, { kind: 'multipleOf', value: 2 });
    expect(result.minimum).toBe(1);
    expect(result.maximum).toBe(9);
    expect(result.multipleOf).toBe(2);
  });

  it('maps exclusive min/max', () => {
    let exclusiveMin: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(exclusiveMin, {
      kind: 'min',
      value: 5,
      inclusive: false,
    });
    expect(exclusiveMin.exclusiveMinimum).toBe(5);
    expect(exclusiveMin.minimum).toBeUndefined();

    let exclusiveMax: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(exclusiveMax, {
      kind: 'max',
      value: 10,
      inclusive: false,
    });
    expect(exclusiveMax.exclusiveMaximum).toBe(10);
    expect(exclusiveMax.maximum).toBeUndefined();
  });

  it('ignores unknown legacy kinds', () => {
    let result: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(result, { kind: 'finite' });
    expect(result).toEqual({});
  });
});

describe('mergeNumberChecksIntoOpenApi (Zod 4 _zod.def)', () => {
  it('maps greater_than and less_than inclusive variants', () => {
    let min: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(min, {
      _zod: { def: { check: 'greater_than', value: 3, inclusive: true } },
    });
    expect(min.minimum).toBe(3);

    let max: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(max, {
      _zod: { def: { check: 'less_than', value: 9, inclusive: true } },
    });
    expect(max.maximum).toBe(9);
  });

  it('maps exclusive greater_than / less_than', () => {
    let min: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(min, {
      _zod: { def: { check: 'greater_than', value: 3, inclusive: false } },
    });
    expect(min.exclusiveMinimum).toBe(3);

    let max: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(max, {
      _zod: { def: { check: 'less_than', value: 9, inclusive: false } },
    });
    expect(max.exclusiveMaximum).toBe(9);
  });

  it('maps multiple_of', () => {
    let result: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(result, {
      _zod: { def: { check: 'multiple_of', value: 4 } },
    });
    expect(result.multipleOf).toBe(4);
  });

  it('returns early when check metadata is missing', () => {
    let result: Record<string, any> = { keep: true };
    mergeNumberChecksIntoOpenApi(result, {});
    mergeNumberChecksIntoOpenApi(result, { _zod: { def: {} } });
    expect(result).toEqual({ keep: true });
  });

  it('ignores unknown Zod number checks', () => {
    let result: Record<string, any> = {};
    mergeNumberChecksIntoOpenApi(result, {
      _zod: { def: { check: 'custom_number_check' } },
    });
    expect(result).toEqual({});
  });
});

describe('mergeArrayLengthChecksIntoOpenApi', () => {
  it('maps legacy min/max kinds', () => {
    let result: Record<string, any> = {};
    mergeArrayLengthChecksIntoOpenApi(result, { kind: 'min', value: 2 });
    mergeArrayLengthChecksIntoOpenApi(result, { kind: 'max', value: 5 });
    expect(result.minItems).toBe(2);
    expect(result.maxItems).toBe(5);
  });

  it('maps Zod 4 min_size / max_size', () => {
    let result: Record<string, any> = {};
    mergeArrayLengthChecksIntoOpenApi(result, {
      _zod: { def: { check: 'min_size', minimum: 1 } },
    });
    mergeArrayLengthChecksIntoOpenApi(result, {
      _zod: { def: { check: 'max_size', maximum: 3 } },
    });
    expect(result.minItems).toBe(1);
    expect(result.maxItems).toBe(3);
  });

  it('maps Zod 4 min_length / max_length on arrays to OpenAPI item bounds', () => {
    let result: Record<string, any> = {};
    mergeArrayLengthChecksIntoOpenApi(result, {
      _zod: { def: { check: 'min_length', minimum: 2 } },
    });
    mergeArrayLengthChecksIntoOpenApi(result, {
      _zod: { def: { check: 'max_length', maximum: 4 } },
    });
    expect(result.minItems).toBe(2);
    expect(result.maxItems).toBe(4);
  });

  it('ignores min_length without numeric minimum', () => {
    let result: Record<string, any> = {};
    mergeArrayLengthChecksIntoOpenApi(result, {
      _zod: { def: { check: 'min_length' } },
    });
    expect(result).toEqual({});
  });

  it('returns early when check metadata is missing', () => {
    let result: Record<string, any> = { keep: true };
    mergeArrayLengthChecksIntoOpenApi(result, {});
    mergeArrayLengthChecksIntoOpenApi(result, { _zod: { def: {} } });
    expect(result).toEqual({ keep: true });
  });
});

describe('mergeNullableOpenApiFragment', () => {
  it('wraps scalar types as a tuple with null', () => {
    expect(mergeNullableOpenApiFragment({ type: 'string' })).toEqual({
      type: ['string', 'null'],
    });
  });

  it('appends null when type is already an array without null', () => {
    expect(
      mergeNullableOpenApiFragment({ type: ['string', 'number'] })
    ).toEqual({
      type: ['string', 'number', 'null'],
    });
  });

  it('does not duplicate null when already present', () => {
    expect(
      mergeNullableOpenApiFragment({ type: ['string', 'null'] })
    ).toEqual({
      type: ['string', 'null'],
    });
  });

  it('uses nullable flag when type is absent', () => {
    expect(mergeNullableOpenApiFragment({})).toEqual({ nullable: true });
  });
});

describe('coalesceZodObjectShape', () => {
  it('returns the original object reference when it is a plain object', () => {
    let shape = { a: 1 };
    expect(coalesceZodObjectShape(shape)).toBe(shape);
  });

  it('returns an empty object when shape is nullish', () => {
    expect(coalesceZodObjectShape(undefined)).toEqual({});
    expect(coalesceZodObjectShape(null)).toEqual({});
  });

  it('returns an empty object for non-object runtime values', () => {
    expect(coalesceZodObjectShape('nope')).toEqual({});
    expect(coalesceZodObjectShape(0)).toEqual({});
  });
});
