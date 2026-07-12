import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeSource } from '../../../src/import/write/source-writer';
import { Artifact } from '../../../src/domain/types';
import { resolveContained } from '../../../src/write/containment';
import { FsMutation, instrumentFsMutations } from './fs-instrument';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'import-containment-nfr004.json');

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'contain-test-')));
}

function makeArtifact(sourcePath: string, resources?: Artifact['resources']): Artifact {
  return {
    id: sourcePath,
    type: 'rule',
    frontmatter: { name: 'test-rule' },
    body: 'Rule body.\n',
    sourcePath,
    resources,
  };
}

/** True when `abs` resolves (symlink-followed) inside `root`. */
function insideRoot(abs: string, root: string): boolean {
  try {
    resolveContained(abs, root);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Measured-runtime evidence accumulators (populated by observing the real fs).
// ---------------------------------------------------------------------------
let writesObserved = 0;
let writesContained = 0;
let escapeVectorsTested = 0;
let escapeVectorsRefused = 0;
let referencedPathsTested = 0;
let referencedPathsRefusedOrWarned = 0;
let outOfRootWritesObserved = 0;
const escapeVectorLog: Array<{ vector: string; refused: boolean; outOfRootWrites: number }> = [];

describe('source writer containment — measured runtime (T-015, FR-032, FR-067, NFR-004)', () => {
  afterAll(() => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-004',
          requirements: ['FR-032', 'FR-067', 'NFR-004'],
          evidenceKind: 'measured_runtime',
          description:
            'Symlink-aware containment on 100% of writes: every real filesystem mutation performed by ' +
            'writeSource is observed at the fs syscall level and confirmed inside the project root; every ' +
            'out-of-root path (parent-traversal and symlink) is refused with 0 out-of-root writes.',
          // FR-032 / NFR-004: instrumented asserted-vs-total write counter.
          writesObserved,
          writesContained,
          containmentRate: writesObserved > 0 ? writesContained / writesObserved : 0,
          outOfRootWritesObserved,
          // FR-067: every enumerated escape/symlink vector recorded as refused.
          escapeVectorsTested,
          escapeVectorsRefused,
          escapeVectors: escapeVectorLog,
          // NFR-004: every referenced (bundle-resource) path refused or warned.
          referencedPathsTested,
          referencedPathsRefusedOrWarned,
          measurableTarget:
            '100% of writes asserted contained; every out-of-root path refused or warned (symlink-aware)',
          pass:
            writesObserved > 0 &&
            writesContained === writesObserved &&
            outOfRootWritesObserved === 0 &&
            escapeVectorsTested > 0 &&
            escapeVectorsRefused === escapeVectorsTested &&
            referencedPathsRefusedOrWarned === referencedPathsTested,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  it('every real fs mutation performed while writing a corpus lands inside the project root (FR-032, NFR-004)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    const mutations: FsMutation[] = [];
    const restore = instrumentFsMutations(mutations);
    try {
      // Corpus of contained writes across varied nested destinations.
      const corpus = [
        'rules/a.md',
        'rules/nested/b.md',
        'rules/deep/nested/c.md',
        'commands/d.md',
        'agents/team/e.md',
        'rules/f.md',
        'rules/g.md',
        'rules/h.md',
      ];
      for (const rel of corpus) {
        const result = writeSource(makeArtifact(rel), sourceRoot, root, {});
        expect(result.written).toBe(true);
      }
      // A bundle-carrying artifact: primary + resources, all contained.
      const bundled = makeArtifact('rules/bundled.md', [
        { relPath: 'assets/one.txt', content: 'one' },
        { relPath: 'assets/two.txt', content: 'two' },
      ]);
      expect(writeSource(bundled, sourceRoot, root, {}).written).toBe(true);
    } finally {
      restore();
    }

    // Measure: every observed write/rename target must resolve inside root.
    const writeOps = mutations.filter((m) => m.op === 'writeFileSync' || m.op === 'renameSync');
    expect(writeOps.length).toBeGreaterThan(0);
    for (const m of writeOps) {
      writesObserved++;
      if (insideRoot(m.target, root)) {
        writesContained++;
      } else {
        outOfRootWritesObserved++;
      }
    }
    fs.rmSync(root, { recursive: true, force: true });

    // 100% of observed real writes were contained.
    expect(writesContained).toBe(writesObserved);
    expect(outOfRootWritesObserved).toBe(0);
  });

  it('refuses 100% of enumerated root-escaping vectors, incl. symlinks, with 0 out-of-root writes (FR-067)', () => {
    // Each factory builds a fresh vector inside a fresh root and returns the
    // escaping artifact plus the sourceRoot to write from.
    type Vector = {
      name: string;
      build: (root: string, sourceRoot: string, outside: string) => Artifact;
    };
    const vectors: Vector[] = [
      {
        name: 'parent-traversal-deep',
        build: () => makeArtifact('../../../../outside/escape.md'),
      },
      {
        name: 'parent-traversal-shallow',
        build: () => makeArtifact('../../escape.md'),
      },
      {
        name: 'parent-traversal-sibling',
        build: () => makeArtifact('../../sibling/escape.md'),
      },
      {
        name: 'symlinked-directory',
        build: (root, sourceRoot, outside) => {
          fs.symlinkSync(outside, path.join(sourceRoot, 'evil-link'));
          return makeArtifact('evil-link/escape.md');
        },
      },
      {
        name: 'symlinked-intermediate',
        build: (root, sourceRoot, outside) => {
          fs.mkdirSync(path.join(sourceRoot, 'a'), { recursive: true });
          fs.symlinkSync(outside, path.join(sourceRoot, 'a', 'evil'));
          return makeArtifact('a/evil/deep/escape.md');
        },
      },
      {
        name: 'symlink-to-root-parent',
        build: (root, sourceRoot) => {
          fs.symlinkSync(path.dirname(root), path.join(sourceRoot, 'up'));
          return makeArtifact('up/escape-outside.md');
        },
      },
      {
        name: 'traversal-through-symlink',
        build: (root, sourceRoot, outside) => {
          fs.symlinkSync(outside, path.join(sourceRoot, 'link2'));
          return makeArtifact('link2/../link2/escape.md');
        },
      },
    ];

    for (const v of vectors) {
      const root = makeTempDir();
      const outside = makeTempDir();
      const sourceRoot = path.join(root, 'source');
      fs.mkdirSync(sourceRoot, { recursive: true });
      const mutations: FsMutation[] = [];
      const restore = instrumentFsMutations(mutations);
      let refused = false;
      try {
        const artifact = v.build(root, sourceRoot, outside);
        const result = writeSource(artifact, sourceRoot, root, {});
        // Refusal = not written AND at least one warning explaining the refusal.
        refused = result.written === false && result.warnings.length >= 1;
      } catch {
        // A thrown ContainmentError also counts as a refusal (no write occurred).
        refused = true;
      } finally {
        restore();
      }

      // Count any observed real write that escaped `outside`-or-`root` boundary.
      const escaped = mutations
        .filter((m) => m.op === 'writeFileSync' || m.op === 'renameSync')
        .filter((m) => !insideRoot(m.target, root)).length;

      escapeVectorsTested++;
      if (refused) escapeVectorsRefused++;
      if (escaped > 0) outOfRootWritesObserved += escaped;
      escapeVectorLog.push({ vector: v.name, refused, outOfRootWrites: escaped });

      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });

      expect(refused).toBe(true);
      expect(escaped).toBe(0);
    }

    expect(escapeVectorsRefused).toBe(escapeVectorsTested);
  });

  it('every escaping referenced (bundle-resource) path is refused or warned (NFR-004)', () => {
    // destDir is `source/<primary-dir>` (2 levels under root), so an escaping
    // referenced path needs >2 upward segments to clear the project root.
    const referencedVectors = [
      '../../../outside/resource.txt',
      '../../../../far/resource.txt',
      '../../../../../deep-escape.txt',
    ];
    for (const relPath of referencedVectors) {
      const root = makeTempDir();
      const sourceRoot = path.join(root, 'source');
      fs.mkdirSync(sourceRoot, { recursive: true });
      const mutations: FsMutation[] = [];
      const restore = instrumentFsMutations(mutations);
      let warnedOrRefused = false;
      try {
        const artifact = makeArtifact('rules/primary.md', [{ relPath, content: 'x' }]);
        const result = writeSource(artifact, sourceRoot, root, {});
        // Primary writes; the escaping resource must produce a warning.
        warnedOrRefused = result.warnings.some((w) =>
          /escape|refused|project root/i.test(w.message),
        );
      } catch {
        warnedOrRefused = true;
      } finally {
        restore();
      }

      const escaped = mutations
        .filter((m) => m.op === 'writeFileSync' || m.op === 'renameSync')
        .filter((m) => !insideRoot(m.target, root)).length;
      if (escaped > 0) outOfRootWritesObserved += escaped;

      referencedPathsTested++;
      if (warnedOrRefused) referencedPathsRefusedOrWarned++;

      fs.rmSync(root, { recursive: true, force: true });
      expect(warnedOrRefused).toBe(true);
      expect(escaped).toBe(0);
    }
    expect(referencedPathsRefusedOrWarned).toBe(referencedPathsTested);
  });

  // --- Behavioral guarantees retained from the original suite --------------

  it('writes successfully inside the project root (FR-031, FR-032)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    try {
      const result = writeSource(makeArtifact('rules/my-rule.md'), sourceRoot, root, {});
      expect(result.written).toBe(true);
      expect(fs.existsSync(path.join(sourceRoot, 'rules', 'my-rule.md'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('collision with existing user-authored file: overwrites 0 files, reports collision (FR-033, FR-068)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(path.join(sourceRoot, 'rules'), { recursive: true });
    try {
      const existingPath = path.join(sourceRoot, 'rules', 'my-rule.md');
      fs.writeFileSync(existingPath, '# User authored');
      const originalContent = fs.readFileSync(existingPath, 'utf8');

      const result = writeSource(makeArtifact('rules/my-rule.md'), sourceRoot, root, {});
      expect(result.written).toBe(false);
      expect(result.collision).toBe(true);
      expect(fs.readFileSync(existingPath, 'utf8')).toBe(originalContent);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('overwrites when --overwrite is set (FR-033 escape hatch)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(path.join(sourceRoot, 'rules'), { recursive: true });
    try {
      const existingPath = path.join(sourceRoot, 'rules', 'my-rule.md');
      fs.writeFileSync(existingPath, '# User authored');

      const result = writeSource(makeArtifact('rules/my-rule.md'), sourceRoot, root, {
        overwrite: true,
      });
      expect(result.written).toBe(true);
      expect(result.collision).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
