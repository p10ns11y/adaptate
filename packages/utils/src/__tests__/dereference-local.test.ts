import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import $RefParser from '@apidevtools/json-schema-ref-parser';
import { describe, expect, it, vi } from 'vitest';

import { dereferenceLocalDocument, dereferenceOpenApiDocument } from '../dereference-local.js';
import { getDereferencedOpenAPIDocument } from '../openapi.js';

function describeGraph(value: unknown): string {
  let seen = new Map<object, string>();
  type GraphFrame = {
    value: unknown;
    pointer: string;
    step: 'enter' | 'array' | 'object';
    index: number;
    entries: [string, unknown][];
    parts: string[];
  };
  let stack: GraphFrame[] = [
    { value, pointer: '$', step: 'enter', index: 0, entries: [], parts: [] },
  ];
  let produced = '';
  while (stack.length > 0) {
    let frame = stack[stack.length - 1] as GraphFrame;
    if (frame.step === 'enter') {
      if (!isContainer(frame.value)) {
        produced = JSON.stringify(frame.value);
        stack.pop();
        let parent = stack[stack.length - 1];
        if (parent) parent.parts.push(produced);
        continue;
      }
      let existingPath = seen.get(frame.value);
      if (existingPath) {
        produced = `[[ref ${existingPath}]]`;
        stack.pop();
        let parent = stack[stack.length - 1];
        if (parent) parent.parts.push(produced);
        continue;
      }
      seen.set(frame.value, frame.pointer);
      if (Array.isArray(frame.value)) {
        frame.step = 'array';
      } else {
        frame.entries = Object.entries(frame.value);
        frame.step = 'object';
      }
      frame.index = 0;
      frame.parts = [];
    }
    if (frame.step === 'array') {
      let items = frame.value as unknown[];
      if (frame.index < items.length) {
        let itemIndex = frame.index;
        frame.index += 1;
        stack.push({
          value: items[itemIndex],
          pointer: `${frame.pointer}[${itemIndex}]`,
          step: 'enter',
          index: 0,
          entries: [],
          parts: [],
        });
        continue;
      }
      produced = `[${frame.parts.join(', ')}]`;
    } else {
      if (frame.index < frame.entries.length) {
        let entry = frame.entries[frame.index] as [string, unknown];
        frame.index += 1;
        stack.push({
          value: entry[1],
          pointer: `${frame.pointer}.${entry[0]}`,
          step: 'enter',
          index: 0,
          entries: [],
          parts: [],
        });
        continue;
      }
      let rendered = frame.parts.map((part, partIndex) => {
        let entryKey = frame.entries[partIndex]?.[0] ?? '';
        return `${entryKey}: ${part}`;
      });
      produced = `{${rendered.join(', ')}}`;
    }
    stack.pop();
    let parent = stack[stack.length - 1];
    if (parent) parent.parts.push(produced);
  }
  return produced;
}

function isContainer(value: unknown): value is object {
  return Boolean(value) && typeof value === 'object';
}

async function matchesOptionalParser(document: unknown): Promise<void> {
  let dereferenced = dereferenceLocalDocument(structuredClone(document));
  let parsedByOptionalLibrary = await $RefParser.dereference(structuredClone(document));
  expect(describeGraph(dereferenced)).toBe(describeGraph(parsedByOptionalLibrary));
}

function nestedObjects(linkCount: number): Record<string, unknown> {
  let root: Record<string, unknown> = { type: 'object' };
  let current = root;
  for (let level = 0; level < linkCount; level += 1) {
    let next: Record<string, unknown> = { type: 'object' };
    current.next = next;
    current = next;
  }
  return root;
}

function refChain(linkCount: number): Record<string, unknown> {
  let document: Record<string, unknown> = {
    start: { $ref: '#/link0' },
  };
  for (let linkIndex = 0; linkIndex < linkCount; linkIndex += 1) {
    let nextPointer = linkIndex === linkCount - 1 ? '#/end' : `#/link${linkIndex + 1}`;
    document[`link${linkIndex}`] = { $ref: nextPointer };
  }
  document.end = { type: 'string' };
  return document;
}

describe('local $ref resolver', () => {
  it('inlines a local pointer and shares the schema object', async () => {
    let document = {
      components: {
        schemas: {
          Name: { type: 'string', minLength: 1 },
        },
      },
      paths: {
        '/name': { $ref: '#/components/schemas/Name' },
      },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      components: { schemas: { Name: { type: string } } };
      paths: { '/name': { type: string } };
    };

    expect(dereferenced.paths['/name']).toEqual({ type: 'string', minLength: 1 });
    expect(dereferenced.paths['/name']).toBe(dereferenced.components.schemas.Name);
    await matchesOptionalParser(document);
  });

  it('follows nested local pointers to one shared schema', async () => {
    let document = {
      components: {
        schemas: {
          A: { $ref: '#/components/schemas/B' },
          B: { $ref: '#/components/schemas/C' },
          C: { type: 'string' },
        },
      },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      components: { schemas: { A: { type: string }; B: { type: string }; C: { type: string } } };
    };

    expect(dereferenced.components.schemas.A).toEqual({ type: 'string' });
    expect(dereferenced.components.schemas.B).toBe(dereferenced.components.schemas.A);
    expect(dereferenced.components.schemas.C).toBe(dereferenced.components.schemas.A);
    await matchesOptionalParser(document);
  });

  it('returns the in-progress schema when a pointer cycle lands on it', async () => {
    let document = {
      A: { $ref: '#/B' },
      B: {
        type: 'object',
        back: { $ref: '#/A' },
      },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      A: { back: unknown };
      B: { back: unknown };
    };

    expect(dereferenced.A).toBe(dereferenced.B);
    expect(dereferenced.B.back).toBe(dereferenced.B);
    await matchesOptionalParser(document);
  });

  it('keeps a shared object when a schema references itself', async () => {
    let document = {
      components: {
        schemas: {
          Node: {
            type: 'object',
            properties: {
              child: { $ref: '#/components/schemas/Node' },
            },
          },
        },
      },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      components: { schemas: { Node: { properties: { child: unknown } } } };
    };
    let node = dereferenced.components.schemas.Node;

    expect(node.properties.child).toBe(node);
    await matchesOptionalParser(document);
  });

  it('keeps shared objects for a mutual schema cycle', async () => {
    let document = {
      components: {
        schemas: {
          A: { type: 'object', properties: { b: { $ref: '#/components/schemas/B' } } },
          B: { type: 'object', properties: { a: { $ref: '#/components/schemas/A' } } },
        },
      },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      components: {
        schemas: {
          A: { properties: { b: { properties: { a: unknown } } } };
          B: { properties: { a: unknown } };
        };
      };
    };
    let schemaA = dereferenced.components.schemas.A;
    let schemaB = dereferenced.components.schemas.B;

    expect(schemaA.properties.b).toBe(schemaB);
    expect(schemaB.properties.a).toBe(schemaA);
    await matchesOptionalParser(document);
  });

  it('marks a pure pointer cycle with one shared $ref object', async () => {
    let document = {
      A: { $ref: '#/B' },
      B: { $ref: '#/A' },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      A: { $ref: string };
      B: { $ref: string };
    };

    expect(dereferenced.A).toBe(dereferenced.B);
    expect(dereferenced.A).toEqual({ $ref: '#/A' });
    await matchesOptionalParser(document);
  });

  it('finishes a three-node pointer cycle without looping', () => {
    let document = {
      A: { $ref: '#/B' },
      B: { $ref: '#/C' },
      C: { $ref: '#/A' },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      A: { $ref: string };
      B: { $ref: string };
      C: { $ref: string };
    };

    expect(dereferenced.A).toBe(dereferenced.B);
    expect(dereferenced.B).toBe(dereferenced.C);
    expect(dereferenced.A.$ref.startsWith('#/')).toBe(true);
  });

  it('resolves ~0 and ~1 escapes in local pointers', async () => {
    let document = {
      components: {
        schemas: {
          'Foo/Bar': { type: 'object', properties: { n: { type: 'string' } } },
          'Tilde~Name': { type: 'integer' },
          Alias: { $ref: '#/components/schemas/Foo~1Bar' },
          TildeAlias: { $ref: '#/components/schemas/Tilde~0Name' },
        },
      },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      components: {
        schemas: {
          'Foo/Bar': { type: string; properties: { n: { type: string } } };
          'Tilde~Name': { type: string };
          Alias: { type: string; properties: { n: { type: string } } };
          TildeAlias: { type: string };
        };
      };
    };
    let schemas = dereferenced.components.schemas;

    expect(schemas.Alias).toBe(schemas['Foo/Bar']);
    expect(schemas.Alias.properties).toEqual({ n: { type: 'string' } });
    expect(schemas.TildeAlias).toBe(schemas['Tilde~Name']);
    expect(schemas.TildeAlias).toEqual({ type: 'integer' });
    await matchesOptionalParser(document);
  });

  it('resolves an intermediate pointer through another local ref', async () => {
    let document = {
      d: { $ref: '#/a/b' },
      a: { $ref: '#/c' },
      c: { b: { type: 'string' } },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      a: { b: { type: string } };
      c: { b: { type: string } };
      d: { type: string };
    };

    expect(dereferenced.d).toEqual({ type: 'string' });
    expect(dereferenced.d).toBe(dereferenced.c.b);
    expect(dereferenced.a).toBe(dereferenced.c);
    await matchesOptionalParser(document);
  });

  it('merges sibling keywords onto the resolved schema', async () => {
    let document = {
      person: { properties: { firstName: { type: 'string' } } },
      employee: { $ref: '#/person', salary: { type: 'number' } },
      base: {
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'integer' } },
        meta: { tags: ['red'] },
        tags: ['red'],
      },
      extended: {
        $ref: '#/base',
        type: 'integer',
        properties: { age: { type: 'number' }, city: { type: 'string' } },
        meta: { tags: ['blue'] },
        tags: ['blue', 'green'],
      },
    };

    await matchesOptionalParser(document);
  });

  it('merges an object sibling into an array-valued property', () => {
    let document = {
      target: { box: { items: ['red'] } },
      extended: { $ref: '#/target', box: { items: { note: 'x' } } },
    };
    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      extended: { box: { items: string[] & { note?: string } } };
    };
    expect(dereferenced.extended.box.items[0]).toBe('red');
    expect(dereferenced.extended.box.items.note).toBe('x');
  });

  it('leaves non-pointer fragments in place', async () => {
    let document = {
      named: { $ref: '#foo' },
      real: { $ref: '#/target' },
      target: { type: 'boolean' },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      named: { $ref: string };
      real: { type: string };
      target: { type: string };
    };

    expect(dereferenced.named).toEqual({ $ref: '#foo' });
    expect(dereferenced.real).toBe(dereferenced.target);
    await matchesOptionalParser(document);
  });

  it('resolves pointers to arrays, null, the document root, and an empty token', async () => {
    let document = {
      '': { type: 'boolean' },
      items: [{ type: 'string' }, { $ref: '#/items/0' }],
      box: { value: null },
      flag: true,
      aliasEmpty: { $ref: '#/' },
      aliasItem: { $ref: '#/items/0' },
      aliasNull: { $ref: '#/box/value' },
      aliasFlag: { $ref: '#/flag' },
      self: { $ref: '#' },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as Record<string, any>;

    expect(dereferenced.aliasEmpty).toBe(dereferenced['']);
    expect(dereferenced.aliasItem).toBe(dereferenced.items[0]);
    expect(dereferenced.aliasNull).toBeNull();
    expect(dereferenced.aliasFlag).toBe(true);
    expect(dereferenced.self).toBe(dereferenced);
    await matchesOptionalParser(document);
  });

  it('keeps a direct self pointer as a shared marker', async () => {
    let document = { loop: { $ref: '#/loop' } };
    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      loop: { $ref: string };
    };

    expect(dereferenced.loop).toEqual({ $ref: '#/loop' });
    await matchesOptionalParser(document);
  });

  it('reports a missing local pointer', () => {
    expect(() => dereferenceLocalDocument({ a: { $ref: '#/nope' } })).toThrow(
      'Missing $ref pointer "#/nope". Token "nope" does not exist.',
    );
    expect(() => dereferenceLocalDocument({ a: 'hello', b: { $ref: '#/a/b' } })).toThrow(
      /Token "b" does not exist/,
    );
  });

  it('dereferences documents deeper than the optional parser', async () => {
    let withinParserLimit = nestedObjects(40);
    let pastParserLimit = nestedObjects(500);

    await expect($RefParser.dereference(structuredClone(withinParserLimit))).resolves.toBeTruthy();
    expect(() => dereferenceLocalDocument(structuredClone(withinParserLimit))).not.toThrow();
    await expect($RefParser.dereference(structuredClone(pastParserLimit))).rejects.toThrow(
      /Maximum dereference depth/,
    );
    expect(() => dereferenceLocalDocument(structuredClone(pastParserLimit))).not.toThrow();
  });

  it('resolves a local pointer chain and rejects nested refs past 500', () => {
    let dereferenced = dereferenceLocalDocument(refChain(20)) as { start: { type: string }; end: { type: string } };
    expect(dereferenced.start).toBe(dereferenced.end);
    expect(dereferenced.end).toEqual({ type: 'string' });
    expect(() => dereferenceLocalDocument(refChain(501))).toThrow(RangeError);
    expect(() => dereferenceLocalDocument(refChain(501))).toThrow(/Maximum dereference depth \(500\)/);
  });

  it('throws when a sibling ref expands without repeating a path', () => {
    let document = {
      A: {
        properties: {
          p: {
            $ref: '#/A',
            properties: { p: { description: 'd' } },
          },
        },
      },
    };
    expect(() => dereferenceLocalDocument(document)).toThrow(RangeError);
    expect(() => dereferenceLocalDocument(document)).toThrow(
      /Maximum dereference depth \(500\) exceeded at #\/A\/properties\/p/,
    );
  });

  it('throws when a sibling merge walks back into an ancestor', () => {
    let document = {
      box: {
        box: { $ref: '#', properties: { p: { $ref: '#' } } },
        child: {
          child: [
            {
              p: {
                p: {
                  properties: {
                    $ref: '#/box/box',
                    properties: { p: { $ref: '#/box/box' } },
                  },
                },
              },
            },
          ],
        },
      },
    };
    expect(() => dereferenceLocalDocument(document)).toThrow(RangeError);
    expect(() => dereferenceLocalDocument(document)).toThrow(/sibling merge/);
  });

  it('merges a sibling child onto a node that points at itself', () => {
    let document = {
      Node: {
        type: 'object',
        properties: {
          child: { $ref: '#/Node' },
        },
      },
      Tree: {
        $ref: '#/Node',
        properties: {
          child: {
            properties: {
              child: { description: 'g' },
            },
          },
        },
      },
    };
    let dereferenced = dereferenceLocalDocument(document) as {
      Node: { type: string; properties: { child: unknown } };
      Tree: {
        type: string;
        properties: { child: { type: string; properties: { child: { description: string; properties: unknown } } } };
      };
    };
    expect(dereferenced.Node.properties.child).toBe(dereferenced.Node);
    expect(dereferenced.Tree.type).toBe('object');
    expect(dereferenced.Tree.properties.child.type).toBe('object');
    expect(dereferenced.Tree.properties.child.properties.child.description).toBe('g');
    expect(dereferenced.Tree.properties.child.properties.child.properties).toBe(
      dereferenced.Node.properties,
    );
  });

  it('merges a sibling items chain onto an array that points at itself', () => {
    let document = {
      Node: {
        type: 'array',
        items: { $ref: '#/Node' },
      },
      Tree: {
        $ref: '#/Node',
        items: {
          items: {
            items: { description: 'g' },
          },
        },
      },
    };
    let dereferenced = dereferenceLocalDocument(document) as {
      Node: { type: string; items: unknown };
      Tree: {
        type: string;
        items: { type: string; items: { type: string; items: { description: string; items: unknown } } };
      };
    };
    expect(dereferenced.Node.items).toBe(dereferenced.Node);
    expect(dereferenced.Tree.type).toBe('array');
    expect(dereferenced.Tree.items.type).toBe('array');
    expect(dereferenced.Tree.items.items.items.description).toBe('g');
    expect(dereferenced.Tree.items.items.items.items).toBe(dereferenced.Node);
  });

  it('merges a shared anchor into a sibling ref', () => {
    let shared = { k2: { mark: 1 } };
    let document = {
      T: { k: shared },
      ext: { $ref: '#/T', k: { k2: shared } },
    };
    let dereferenced = dereferenceLocalDocument(document) as {
      T: { k: { k2: { mark: number } } };
      ext: { k: { k2: { mark: number; k2: { mark: number } } } };
    };
    expect(dereferenced.T.k.k2.mark).toBe(1);
    expect(dereferenced.ext.k.k2.mark).toBe(1);
    expect(dereferenced.ext.k.k2.k2).toBe(dereferenced.T.k.k2);
  });

  it('does not loop when the input object graph is already cyclic', async () => {
    let loop: Record<string, unknown> = { name: 'loop' };
    loop.self = loop;

    let dereferenced = dereferenceLocalDocument(loop) as { self: unknown };
    expect(dereferenced.self).toBe(dereferenced);

    let scannedDocument = (await dereferenceOpenApiDocument(loop)) as { self: unknown };
    expect(scannedDocument.self).toBe(scannedDocument);
  });

  it('returns primitive documents unchanged', () => {
    expect(dereferenceLocalDocument(null)).toBeNull();
    expect(dereferenceLocalDocument('text')).toBe('text');
    expect(dereferenceLocalDocument(false)).toBe(false);
  });

  it('does not fetch the network for local pointers', () => {
    let fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    dereferenceLocalDocument({
      components: {
        schemas: {
          Name: { type: 'string' },
          Alias: { $ref: '#/components/schemas/Name' },
        },
      },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('resolves an extended root pointer without dropping sibling schemas', async () => {
    let document = {
      $ref: '#/defs/A',
      defs: { A: { type: 'string' } },
    };

    let dereferenced = dereferenceLocalDocument(structuredClone(document)) as {
      type?: string;
      defs: { A: { type: string } };
    };

    expect(dereferenced.type).toBe('string');
    expect(dereferenced.defs.A.type).toBe('string');
    await matchesOptionalParser(document);
  });
});

describe('remote and file $ref path', () => {
  it('resolves a file $ref with the optional parser', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'adaptate-ref-'));
    try {
      let widgetPath = path.join(directory, 'widget.json');
      await writeFile(
        widgetPath,
        JSON.stringify({ type: 'object', properties: { id: { type: 'string' } } }),
      );
      let specPath = path.join(directory, 'spec.json');
      await writeFile(
        specPath,
        JSON.stringify({
          openapi: '3.0.0',
          components: { schemas: { Widget: { $ref: widgetPath } } },
        }),
      );

      let dereferenced = (await getDereferencedOpenAPIDocument({
        location: 'filesystem',
        callSiteURL: pathToFileURL(path.join(directory, 'caller.ts')).href,
        relativePathToSpecFile: 'spec.json',
      })) as {
        components: { schemas: { Widget: { type: string; properties: { id: { type: string } } } } };
      };

      expect(dereferenced.components.schemas.Widget).toEqual({
        type: 'object',
        properties: { id: { type: 'string' } },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
