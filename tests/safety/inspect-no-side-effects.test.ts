import * as fs from 'fs';
import * as path from 'path';
import { inspectArtifact } from '../../src/inspect/lookup';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

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

describe('T-006: 0 filesystem writes across success and every failure path (NFR-004, NFR-007)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');
    t.write('.prosaic/skills/greeter/SKILL.md', '---\nname: greeter\ndescription: d\n---\nGreet.\n');
    t.write('.prosaic/skills/greeter/reference.md', '# Reference\n');
  });
  afterEach(() => t.cleanup());

  const runs: Array<{ label: string; call: () => void }> = [
    {
      label: 'standalone-success',
      call: () => inspectArtifact({ projectRoot: t.root, artifactId: 'rules/style.md' }),
    },
    {
      label: 'bundle-success',
      call: () => inspectArtifact({ projectRoot: t.root, artifactId: 'skills/greeter/SKILL.md' }),
    },
    {
      label: 'not-found',
      call: () => inspectArtifact({ projectRoot: t.root, artifactId: 'rules/does-not-exist.md' }),
    },
    {
      label: 'internal',
      call: () =>
        inspectArtifact({
          projectRoot: t.root,
          artifactId: 'rules/style.md',
          cli: { artifactTypes: ['not-a-real-type'] as unknown as never[] },
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

describe('T-006: no network module is invoked by inspect (NFR-008)', () => {
  const SRC_ROOT = path.join(__dirname, '..', '..', 'src');
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
    const specifiers: string[] = [];
    const importRe = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content))) specifiers.push(m[1]);
    return specifiers;
  }

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

  it('finds 0 network/LLM-client package imports in the inspect transitive graph', () => {
    const { packages } = walkImportGraph([path.join(SRC_ROOT, 'inspect', 'lookup.ts')]);
    const offenders = [...packages].filter((pkg) => {
      const base = pkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : pkg.split('/')[0];
      return NETWORK_OR_LLM_PACKAGES.has(base);
    });
    expect(offenders).toEqual([]);
  });

  it('finds 0 imports of src/write/** or src/lifecycle/** in the inspect transitive graph', () => {
    const { visited } = walkImportGraph([path.join(SRC_ROOT, 'inspect', 'lookup.ts')]);
    const offenders = [...visited]
      .map((file) => path.relative(SRC_ROOT, file))
      .filter((rel) => rel.startsWith('write' + path.sep) || rel.startsWith('lifecycle' + path.sep));
    expect(offenders).toEqual([]);
  });
});
