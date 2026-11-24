export type JsonPath = ReadonlyArray<string | number>;

// openPath and tailOpen are non-enumerable, so toEqual and JSON of a step are unchanged.
export function withFrontier<S extends object>(
  step: S,
  openPath: JsonPath,
  tailOpen: boolean,
): S & { readonly openPath: JsonPath; readonly tailOpen: boolean } {
  return Object.defineProperties(step, {
    openPath: { value: openPath },
    tailOpen: { value: tailOpen },
  }) as S & { readonly openPath: JsonPath; readonly tailOpen: boolean };
}
