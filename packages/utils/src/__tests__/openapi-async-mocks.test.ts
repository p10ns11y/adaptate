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
  vi.doUnmock('js-yaml');
  vi.doUnmock('../load-yaml.js');
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
    let { getDereferencedOpenAPIDocument } = await import('../openapi.js');

    await expect(
      getDereferencedOpenAPIDocument({
        location: 'filesystem',
        callSiteURL: import.meta.url,
        relativePathToSpecFile: '../fixtures/remote-ref.yml',
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
    let { getDereferencedOpenAPIDocument } = await import('../openapi.js');

    await expect(
      getDereferencedOpenAPIDocument({
        location: 'filesystem',
        callSiteURL: import.meta.url,
        relativePathToSpecFile: '../fixtures/remote-ref.yml',
      })
    ).rejects.toThrow('Error reading OpenAPI document: ');
  });

  it('dereferences an empty document locally when the location is unknown', async () => {
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
    let { getDereferencedOpenAPIDocument } = await import('../openapi.js');

    let result = (await getDereferencedOpenAPIDocument({
      location: 'unknown-runtime' as never,
      callSiteURL: import.meta.url,
      relativePathToSpecFile: 'ignored.yml',
    } as never)) as Record<string, unknown>;

    expect(result).toEqual({});
    expect(seenDocuments).toEqual([]);
  });

  it('uses the optional parser for http and https $refs', async () => {
    vi.resetModules();
    vi.doMock('@apidevtools/json-schema-ref-parser', () => ({
      default: {
        dereference: vi.fn(async () => ({ fromParser: true })),
      },
    }));
    let { dereferenceOpenApiDocument } = await import('../dereference-local.js');

    let httpsDocument = await dereferenceOpenApiDocument({
      schema: { $ref: 'https://example.com/widget.json' },
    });
    let httpDocument = await dereferenceOpenApiDocument({
      list: [{ $ref: 'http://example.com/widget.json' }],
    });

    expect(httpsDocument).toEqual({ fromParser: true });
    expect(httpDocument).toEqual({ fromParser: true });
  });

  it('resolves JSON local refs when both optional packages fail to import', async () => {
    vi.resetModules();
    vi.doMock('js-yaml', () => {
      throw new Error("Cannot find package 'js-yaml'");
    });
    vi.doMock('@apidevtools/json-schema-ref-parser', () => {
      throw new Error("Cannot find package '@apidevtools/json-schema-ref-parser'");
    });
    let { getDereferencedOpenAPIDocument, fetchYamlContent } = await import('../openapi.js');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: async () =>
        JSON.stringify({
          openapi: '3.0.0',
          components: {
            schemas: {
              Name: { type: 'string' },
              Alias: { $ref: '#/components/schemas/Name' },
            },
          },
        }),
    } as Response);

    let fetched = (await fetchYamlContent('https://example.com/spec.json')) as {
      components: { schemas: { Name: { type: string }; Alias: { $ref: string } } };
    };
    expect(fetched.components.schemas.Name).toEqual({ type: 'string' });
    expect(fetched.components.schemas.Alias.$ref).toBe('#/components/schemas/Name');

    let fromWeb = (await getDereferencedOpenAPIDocument({
      location: 'web',
      webURL: 'https://example.com/spec.json',
    })) as {
      components: { schemas: { Name: { type: string }; Alias: { type: string } } };
    };
    expect(fromWeb.components.schemas.Alias).toBe(fromWeb.components.schemas.Name);

    let dereferenced = (await getDereferencedOpenAPIDocument({
      location: 'filesystem',
      callSiteURL: import.meta.url,
      relativePathToSpecFile: '../fixtures/local-ref.json',
    })) as {
      components: { schemas: { Widget: { properties: { child: unknown } } } };
    };
    expect(dereferenced.components.schemas.Widget.properties.child).toBe(
      dereferenced.components.schemas.Widget,
    );
  });

  it('names js-yaml when YAML is parsed and the package is absent', async () => {
    vi.resetModules();
    vi.doMock('js-yaml', () => {
      throw new Error("Cannot find package 'js-yaml'");
    });
    let { fetchYamlContent, getDereferencedOpenAPIDocument } = await import('../openapi.js');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      text: async () => 'openapi: 3.0.0\ninfo:\n  title: Mock\n  version: "1"\n',
    } as Response);

    await expect(fetchYamlContent('https://example.com/openapi.yaml')).rejects.toThrow(
      /Optional peer dependency "js-yaml" is required to parse YAML/,
    );
    await expect(
      getDereferencedOpenAPIDocument({
        location: 'filesystem',
        callSiteURL: import.meta.url,
        relativePathToSpecFile: '../fixtures/base-schema.yml',
      }),
    ).rejects.toThrow(/Error reading OpenAPI document: Optional peer dependency "js-yaml"/);
  });

  it('names the ref parser when a remote $ref is resolved and the package is absent', async () => {
    vi.resetModules();
    vi.doMock('@apidevtools/json-schema-ref-parser', () => {
      throw new Error("Cannot find package '@apidevtools/json-schema-ref-parser'");
    });
    let { getDereferencedOpenAPIDocument } = await import('../openapi.js');

    await expect(
      getDereferencedOpenAPIDocument({
        location: 'filesystem',
        callSiteURL: import.meta.url,
        relativePathToSpecFile: '../fixtures/remote-ref.yml',
      }),
    ).rejects.toThrow(
      /Optional peer dependency "@apidevtools\/json-schema-ref-parser" is required to resolve remote or file \$ref pointers/,
    );
  });

  it('names the optional package when its export is missing', async () => {
    vi.resetModules();
    vi.doMock('js-yaml', () => ({ load: undefined }));
    vi.doMock('@apidevtools/json-schema-ref-parser', () => ({ default: {} }));
    let { parseSpecDocumentText } = await import('../parse-spec-document.js');
    let { dereferenceOpenApiDocument } = await import('../dereference-local.js');

    await expect(parseSpecDocumentText('title: Mock\n')).rejects.toThrow(
      /Optional peer dependency "js-yaml"/,
    );
    await expect(
      dereferenceOpenApiDocument({ schema: { $ref: 'https://example.com/widget.json' } }),
    ).rejects.toThrow(/Optional peer dependency "@apidevtools\/json-schema-ref-parser"/);
  });
});
