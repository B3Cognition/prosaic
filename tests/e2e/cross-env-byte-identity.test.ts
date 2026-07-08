import * as fs from 'fs';
import * as path from 'path';
import { apply } from '../../src/lifecycle/run';
import { builtinRegistry } from '../../src/registry/builtin';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedCorpus } from '../helpers/corpus';

/** Collect every generated file (path → content) under a root, excluding state. */
function collect(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs);
      if (rel.startsWith('.prosaic') || rel === '.prosaic-manifest.json') continue;
      if (e.isDirectory()) walk(abs);
      else out.set(rel, fs.readFileSync(abs, 'utf8'));
    }
  };
  walk(root);
  return out;
}

describe('cross-environment byte identity (T-039, NFR-007)', () => {
  let a: TempRoot;
  let b: TempRoot;
  beforeEach(() => {
    a = makeTempRoot('prosaic-envA-');
    b = makeTempRoot('prosaic-envB-');
  });
  afterEach(() => {
    a.cleanup();
    b.cleanup();
  });

  it('two runs on identical inputs produce byte-identical output', () => {
    seedCorpus(a, 20);
    seedCorpus(b, 20);

    apply({ projectRoot: a.root, registry: builtinRegistry() });
    apply({ projectRoot: b.root, registry: builtinRegistry() });

    const fa = collect(a.root);
    const fb = collect(b.root);

    expect([...fa.keys()].sort()).toEqual([...fb.keys()].sort());
    for (const [rel, content] of fa) {
      expect(content).toBe(fb.get(rel));
    }
  });
});
