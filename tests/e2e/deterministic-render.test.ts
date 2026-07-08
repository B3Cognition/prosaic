import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { apply } from '../../src/lifecycle/run';
import { builtinRegistry } from '../../src/registry/builtin';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedCorpus } from '../helpers/corpus';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'deterministic-render-nfr009.json');
const GOLDEN_PATH = path.join(RESULTS_DIR, 'deterministic-render-nfr009-golden.json');

/** Hash every output file under a root (excluding state files) and return sorted pairs. */
function outputDigest(root: string): Array<{ file: string; sha256: string }> {
  const pairs: Array<{ file: string; sha256: string }> = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs);
      if (rel.startsWith('.prosaic') || rel === '.prosaic-manifest.json') continue;
      if (e.isDirectory()) walk(abs);
      else {
        const content = fs.readFileSync(abs, 'utf8');
        pairs.push({ file: rel, sha256: crypto.createHash('sha256').update(content, 'utf8').digest('hex') });
      }
    }
  };
  walk(root);
  return pairs.sort((a, b) => a.file.localeCompare(b.file));
}

describe('deterministic structured-format rendering (T-040, NFR-009)', () => {
  let r1: TempRoot;
  let r2: TempRoot;
  beforeEach(() => {
    r1 = makeTempRoot('prosaic-det-r1-');
    r2 = makeTempRoot('prosaic-det-r2-');
  });
  afterEach(() => {
    r1.cleanup();
    r2.cleanup();
  });

  it('repeated renders of unchanged input are byte-identical', () => {
    seedCorpus(r1, 20);
    seedCorpus(r2, 20);

    apply({ projectRoot: r1.root, registry: builtinRegistry() });
    apply({ projectRoot: r2.root, registry: builtinRegistry() });

    const digest1 = outputDigest(r1.root);
    const digest2 = outputDigest(r2.root);

    const divergent: Array<{ file: string; sha256Run1: string; sha256Run2: string }> = [];
    for (let i = 0; i < digest1.length; i++) {
      const d1 = digest1[i];
      const d2 = digest2.find((d) => d.file === d1.file);
      if (!d2 || d1.sha256 !== d2.sha256) {
        divergent.push({ file: d1.file, sha256Run1: d1.sha256, sha256Run2: d2?.sha256 ?? '(missing)' });
      }
    }

    const pass = divergent.length === 0 && digest1.length === digest2.length;

    // Write golden snapshot on first run; compare on subsequent runs.
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    if (!fs.existsSync(GOLDEN_PATH)) {
      fs.writeFileSync(GOLDEN_PATH, JSON.stringify({ digest: digest1 }, null, 2));
    }
    const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8')) as { digest: typeof digest1 };
    const goldenMismatches = digest1.filter((d, i) => golden.digest[i]?.sha256 !== d.sha256);

    // Emit measured golden-comparison artifact so CI can archive it as build evidence (NFR-009).
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-009',
          description: 'Byte-identical structured-format output across repeated renders of unchanged input',
          nodeVersion: process.version,
          platform: process.platform,
          fileCount: digest1.length,
          identicalCount: digest1.length - divergent.length,
          divergentCount: divergent.length,
          divergent,
          goldenMismatchCount: goldenMismatches.length,
          goldenFile: GOLDEN_PATH,
          pass,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    expect(digest1.map((d) => d.file)).toEqual(digest2.map((d) => d.file));
    expect(divergent).toHaveLength(0);
  });
});
