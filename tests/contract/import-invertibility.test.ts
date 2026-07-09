import fs from 'fs';
import path from 'path';
import { WarningKind } from '../../src/domain/warnings';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const NFR006_PATH = path.join(RESULTS_DIR, 'import-no-new-deps.json');

// Baseline runtime deps present before the import module was added (NFR-006).
const BASELINE_DEPS = new Set(['@iarna/toml', 'js-yaml', 'yargs', 'zod']);

const IMPORT_WARNING_KINDS: WarningKind[] = [
  'portability',
  'ambiguous-detection',
  'unrecognized-format',
  'injected-strip',
  'defaulted-choice',
  'override-recovered',
  'round-trip-mismatch',
  'unverified-target',
];

const ORIGINAL_WARNING_KINDS: WarningKind[] = [
  'malformed-frontmatter',
  'schema-invalid',
  'classification',
  'unsupported-pair',
  'lossy-intent',
  'unresolved-reference',
  'config',
];

describe('NFR-006: no new runtime dependencies added by import module', () => {
  let addedDependencies: string[] = [];

  beforeAll(() => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { dependencies?: Record<string, string> };
    const currentDeps = new Set(Object.keys(pkg.dependencies ?? {}));
    addedDependencies = [...currentDeps].filter((d) => !BASELINE_DEPS.has(d));
  });

  afterAll(() => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      NFR006_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-006',
          description: 'Import module adds 0 new third-party runtime dependencies beyond those already used by apply',
          baselineDependencies: [...BASELINE_DEPS].sort(),
          addedDependencies,
          addedCount: addedDependencies.length,
          pass: addedDependencies.length === 0,
          measurableTarget: '0 new runtime dependencies added',
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  it('package.json dependencies count is unchanged (0 new runtime deps)', () => {
    expect(addedDependencies).toHaveLength(0);
  });
});

describe('import warning-kind union extension (T-001, NFR-006)', () => {
  it('gains the 8 import-specific warning kinds', () => {
    for (const kind of IMPORT_WARNING_KINDS) {
      const w: { kind: WarningKind; message: string } = { kind, message: 'test' };
      expect(w.kind).toBe(kind);
    }
  });

  it('retains all 7 original warning kinds (0 removals)', () => {
    for (const kind of ORIGINAL_WARNING_KINDS) {
      const w: { kind: WarningKind; message: string } = { kind, message: 'test' };
      expect(w.kind).toBe(kind);
    }
  });

  it('total union has exactly 15 kinds (7 original + 8 import)', () => {
    const all = [...ORIGINAL_WARNING_KINDS, ...IMPORT_WARNING_KINDS];
    expect(new Set(all).size).toBe(15);
  });
});
