import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `getDereferencedOpenAPIDocument` treats `process?.versions?.node` as "running on Node".
 * Tests need that check falsy without replacing `globalThis.process` with `undefined`,
 * because Vitest and Node expect a real `process` object (e.g. `process.nextTick`).
 */
function createProcessStubWithoutNodeVersion(
  realProcess: NodeJS.Process
): NodeJS.Process {
  return new Proxy(realProcess, {
    get(target, property, receiver) {
      if (property === 'versions') {
        let realVersions = target.versions;
        return new Proxy(realVersions, {
          get(versionsTarget, versionKey, versionsReceiver) {
            if (versionKey === 'node') {
              return undefined;
            }
            return Reflect.get(versionsTarget, versionKey, versionsReceiver);
          },
        });
      }
      return Reflect.get(target, property, receiver);
    },
  }) as NodeJS.Process;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('@apidevtools/json-schema-ref-parser');
  vi.doUnmock('../load-yaml.ts');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('getDereferencedOpenAPIDocument (async module isolation)', () => {
  it('propagates JSON Schema parser failures', async () => {
    vi.resetModules();
    vi.doMock('@apidevtools/json-schema-ref-parser', () => ({
      default: {
        dereference: vi.fn(() => Promise.reject(new Error('parser boom'))),
      },
    }));
    let { getDereferencedOpenAPIDocument } = await import('../openapi.ts');

    await expect(
      getDereferencedOpenAPIDocument({
        location: 'filesystem',
        callSiteURL: import.meta.url,
        relativePathToSpecFile: '../fixtures/base-schema.yml',
      })
    ).rejects.toThrow('Error reading OpenAPI document: parser boom');
  });

  it('wraps arbitrary thrown rejection values', async () => {
    vi.resetModules();
    vi.doMock('@apidevtools/json-schema-ref-parser', () => ({
      default: {
        dereference: vi.fn(() => Promise.reject('non-error rejection')),
      },
    }));
    let { getDereferencedOpenAPIDocument } = await import('../openapi.ts');

    await expect(
      getDereferencedOpenAPIDocument({
        location: 'filesystem',
        callSiteURL: import.meta.url,
        relativePathToSpecFile: '../fixtures/base-schema.yml',
      })
    ).rejects.toThrow('Error reading OpenAPI document: ');
  });

  it('dereferences an empty document when YAML cannot load and the location is unknown', async () => {
    vi.resetModules();
    vi.stubGlobal('process', createProcessStubWithoutNodeVersion(globalThis.process));
    let seenDocuments: unknown[] = [];
    vi.doMock('@apidevtools/json-schema-ref-parser', () => ({
      default: {
        dereference: vi.fn(async (document: unknown) => {
          seenDocuments.push(document);
          return { wrapped: true, document };
        }),
      },
    }));
    let { getDereferencedOpenAPIDocument } = await import('../openapi.ts');

    let result = (await getDereferencedOpenAPIDocument({
      location: 'unknown-runtime' as never,
      callSiteURL: import.meta.url,
      relativePathToSpecFile: 'ignored.yml',
    } as never)) as Record<string, unknown>;

    expect(result.wrapped).toBe(true);
    expect(seenDocuments[0]).toEqual({});
  });
});
