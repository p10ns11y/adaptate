export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

export type StandardIssue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
};

export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardIssue> };

export type StandardValidationResult<Output> =
  | { valid: true; value: Output; issues: null }
  | { valid: false; value: null; issues: ReadonlyArray<StandardIssue> };

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    "~standard" in value &&
    typeof (value as StandardSchemaV1)["~standard"]?.validate === "function"
  );
}

export async function validateStandard<Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
): Promise<StandardValidationResult<Output>> {
  const result = await schema["~standard"].validate(value);
  return result.issues
    ? { valid: false, value: null, issues: result.issues }
    : { valid: true, value: result.value, issues: null };
}

export async function validateAgainstStandardSchemas<
  TSchemas extends Record<string, StandardSchemaV1>,
>(
  value: unknown,
  schemas: TSchemas,
): Promise<{
  [K in keyof TSchemas]: StandardValidationResult<
    NonNullable<TSchemas[K]["~standard"]["types"]>["output"]
  >;
}> {
  const entries = await Promise.all(
    Object.entries(schemas).map(
      async ([name, schema]) =>
        [name, await validateStandard(schema, value)] as const,
    ),
  );
  return Object.fromEntries(entries) as never;
}
