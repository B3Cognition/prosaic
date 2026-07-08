import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { apply } from '../../src/lifecycle/run';
import { builtinRegistry } from '../../src/registry/builtin';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedCorpus } from '../helpers/corpus';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'cross-env-nfr007.json');

/** Collect every generated file (path → sha256 hex) under a root, excluding state. */
function collectHashes(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs);
      if (rel.startsWith('.prosaic') || rel === '.prosaic-manifest.json') continue;
      if (e.isDirectory()) walk(abs);
      else {
        const content = fs.readFileSync(abs, 'utf8');
        out.set(rel, crypto.createHash('sha256').update(content, 'utf8').digest('hex'));
      }
    }
  };
  walk(root);
  return out;
}

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
    const ha = collectHashes(a.root);
    const hb = collectHashes(b.root);

    const keysA = [...fa.keys()].sort();
    const keysB = [...fb.keys()].sort();

    const divergent: Array<{ file: string; hashA: string; hashB: string }> = [];
    for (const [rel, hash] of ha) {
      const hbVal = hb.get(rel);
      if (hash !== hbVal) divergent.push({ file: rel, hashA: hash, hashB: hbVal ?? '(missing)' });
    }

    // Emit measured byte-identity artifact so CI can archive it as build evidence (NFR-007).
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-007',
          description: 'Byte-identity across two independent runs on identical inputs',
          nodeVersion: process.version,
          platform: process.platform,
          fileCount: ha.size,
          identicalCount: ha.size - divergent.length,
          divergentCount: divergent.length,
          divergent,
          pass: divergent.length === 0 && keysA.join('\n') === keysB.join('\n'),
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    expect(keysA).toEqual(keysB);
    for (const [rel, content] of fa) {
      expect(content).toBe(fb.get(rel));
    }
  });
});
