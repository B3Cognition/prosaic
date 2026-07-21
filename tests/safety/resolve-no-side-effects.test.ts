import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { resolveExecutionData } from '../../src/resolve/lookup';
import { Registry, StaticRegistrySource } from '../../src/registry/registry';
import { makeDescriptor } from '../helpers/descriptor-factory';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

function testRegistry(): Registry {
  return new Registry(new StaticRegistrySource([makeDescriptor({ id: 'known-target' })]));
}

/** Recursive, sorted snapshot of every file's relative path + byte size. */
function snapshot(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        const rel = path.relative(root, abs);
        out.push(`${rel}:${fs.statSync(abs).size}`);
      }
    }
  }
  walk(root);
  return out.sort();
}

describe('T-012: 0 filesystem writes across success and every failure path (AC-005, FR-005)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');
  });
  afterEach(() => t.cleanup());

  const brokenRegistry = {
    get: () => {
      throw new Error('boom');
    },
  } as unknown as Registry;

  const runs: Array<{ label: string; call: () => void }> = [
    {
      label: 'success',
      call: () =>
        resolveExecutionData({
          projectRoot: t.root,
          artifactId: 'rules/style.md',
          targetId: 'known-target',
          registry: testRegistry(),
        }),
    },
    {
      label: 'unregistered-target',
      call: () =>
        resolveExecutionData({
          projectRoot: t.root,
          artifactId: 'rules/style.md',
          targetId: 'no-such-target',
          registry: testRegistry(),
        }),
    },
    {
      label: 'artifact-not-found',
      call: () =>
        resolveExecutionData({
          projectRoot: t.root,
          artifactId: 'rules/does-not-exist.md',
          targetId: 'known-target',
          registry: testRegistry(),
        }),
    },
    {
      label: 'internal',
      call: () =>
        resolveExecutionData({
          projectRoot: t.root,
          artifactId: 'rules/style.md',
          targetId: 'known-target',
          registry: brokenRegistry,
        }),
    },
  ];

  for (const run of runs) {
    it(`0 new/modified files after the ${run.label} path, repeated 5 times`, () => {
      for (let i = 0; i < 5; i++) {
        const before = snapshot(t.root);
        run.call();
        const after = snapshot(t.root);
        expect(after).toEqual(before);
      }
    });
  }
});

describe('T-012: static import-graph walk (AC-006, FR-006, NFR-003, ADR-001)', () => {
  const SRC_ROOT = path.join(__dirname, '..', '..', 'src');
  const ENTRY_FILES = [
    path.join(SRC_ROOT, 'resolve', 'resolve-execution.ts'),
    path.join(SRC_ROOT, 'resolve', 'lookup.ts'),
  ];

  /** Known HTTP/LLM-client package names (bare Node built-ins + npm SDKs). */
  const NETWORK_OR_LLM_PACKAGES = new Set([
    'http',
    'https',
    'http2',
    'net',
    'tls',
    'dgram',
    'node-fetch',
    'axios',
    'got',
    'undici',
    'request',
    '@anthropic-ai/sdk',
    'openai',
    '@aws-sdk/client-bedrock-runtime',
  ]);

  function moduleSpecifiers(file: string): string[] {
    const content = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.ES2022, true);
    const specifiers: string[] = [];

    function visit(node: ts.Node): void {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        specifiers.push(node.moduleSpecifier.text);
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        specifiers.push((node.arguments[0] as ts.StringLiteral).text);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return specifiers;
  }

  /** Resolve a relative specifier to an on-disk `.ts` file, or null if not under `src/`. */
  function resolveRelative(fromFile: string, specifier: string): string | null {
    if (!specifier.startsWith('.')) return null;
    const base = path.resolve(path.dirname(fromFile), specifier);
    for (const candidate of [base + '.ts', path.join(base, 'index.ts'), base]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  function walkImportGraph(entries: string[]): { visited: Set<string>; packages: Set<string> } {
    const visited = new Set<string>();
    const packages = new Set<string>();

    function visitFile(file: string): void {
      if (visited.has(file)) return;
      visited.add(file);
      for (const spec of moduleSpecifiers(file)) {
        if (spec.startsWith('.')) {
          const resolved = resolveRelative(file, spec);
          if (resolved && resolved.startsWith(SRC_ROOT)) visitFile(resolved);
        } else {
          packages.add(spec);
        }
      }
    }
    for (const entry of entries) visitFile(entry);
    return { visited, packages };
  }

  it('finds 0 network/LLM-client package imports in the transitive graph', () => {
    const { packages } = walkImportGraph(ENTRY_FILES);
    const offenders = [...packages].filter((pkg) => {
      const base = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0];
      return NETWORK_OR_LLM_PACKAGES.has(base);
    });
    expect(offenders).toEqual([]);
  });

  it('finds 0 imports of src/write/** or src/lifecycle/** in the transitive graph', () => {
    const { visited } = walkImportGraph(ENTRY_FILES);
    const offenders = [...visited]
      .map((file) => path.relative(SRC_ROOT, file))
      .filter((rel) => rel.startsWith('write' + path.sep) || rel.startsWith('lifecycle' + path.sep));
    expect(offenders).toEqual([]);
  });

  it('the transitive graph is non-trivial (sanity check the walk actually traverses)', () => {
    const { visited } = walkImportGraph(ENTRY_FILES);
    expect(visited.size).toBeGreaterThan(3);
  });
});
