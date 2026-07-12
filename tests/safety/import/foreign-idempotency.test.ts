import * as fs from 'fs';
import * as path from 'path';
import { importRun } from '../../../src/import/run';
import { FsMutation, instrumentFsMutations, snapshotTree, diffTrees } from './fs-instrument';
import { FOREIGN_FIXTURES, makeTempDir, stageForeign, writeArtifact } from './foreign-corpus';

/**
 * NFR-002 / SC-006 — source-level idempotency, measured over a real foreign corpus.
 *
 * Prior evidence was a self-referential re-import of the tool's own freshly-written
 * source. Here the oracle is an INDEPENDENT before/after filesystem diff: the real
 * end-to-end `importRun` is executed twice against genuinely-foreign committed
 * fixtures, and the neutral source tree it writes is sha256-snapshotted after each
 * run. The measurable target — 0 changed source files on the second run — is met
 * only when the before/after tree diff is empty AND every actual second-run fs
 * mutation lands byte-identical content (fs-syscall instrumented).
 */
describe('source-level idempotency over a real foreign corpus — measured runtime (NFR-002, SC-006, FR-040, FR-072)', () => {
  interface PerTarget {
    target: string;
    firstRunSourceFiles: number;
    secondRunSourceWrites: number;
    secondRunChangedFiles: number;
    changedPaths: string[];
    idempotent: boolean;
  }
  const perTarget: PerTarget[] = [];

  afterAll(() => {
    const totalSourceFiles = perTarget.reduce((n, t) => n + t.firstRunSourceFiles, 0);
    const totalChanged = perTarget.reduce((n, t) => n + t.secondRunChangedFiles, 0);
    const pass =
      perTarget.length === FOREIGN_FIXTURES.length &&
      totalSourceFiles > 0 &&
      totalChanged === 0 &&
      perTarget.every((t) => t.idempotent);
    const payload = {
      nfr: 'NFR-002',
      requirements: ['NFR-002', 'SC-006', 'FR-040', 'FR-072'],
      evidenceKind: 'measured_runtime',
      description:
        'Re-running the real end-to-end importRun on unchanged genuinely-foreign inputs produces 0 ' +
        'changed source files: measured by a sha256 before/after diff of the written neutral source ' +
        'tree across two consecutive runs, with fs-syscall instrumentation on the second run.',
      oracle: 'independent-before-after-source-tree-diff',
      corpusSize: perTarget.length,
      totalSourceFilesWritten: totalSourceFiles,
      secondRunChangedFileCount: totalChanged,
      measurableTarget: '0 changed source files on the second run over the full foreign corpus',
      pass,
      perTarget,
      recordedAt: new Date().toISOString(),
    };
    writeArtifact('import-idempotency-corpus-nfr002.json', payload);
    writeArtifact('import-idempotency-corpus-sc006.json', {
      ...payload,
      sc: 'SC-006',
      description:
        'Source-level idempotency (SC-006): a second import of unchanged foreign inputs changes 0 files, ' +
        'proven by an independent before/after source-tree diff over the full genuine-foreign corpus.',
    });
  });

  for (const fixture of FOREIGN_FIXTURES) {
    it(`${fixture.id}: a second import of unchanged foreign input changes 0 source files`, () => {
      const root = makeTempDir('idem-corpus-');
      const sourceRoot = path.join(root, '.prosaic');
      try {
        // Stage the genuinely-foreign fixture at the project root's canonical layout
        // path (detection matches paths relative to the project root).
        stageForeign(root, fixture);

        // Run 1: real end-to-end no-flag import writes the neutral source tree.
        const run1 = importRun({ projectRoot: root, overwrite: true });
        expect(run1.resolvedFormat).toBe(fixture.id);
        expect(run1.files.some((f) => f.outcome.ok)).toBe(true);

        const before = snapshotTree(sourceRoot);
        const firstRunSourceFiles = Object.keys(before).filter((k) => !k.endsWith('/')).length;
        expect(firstRunSourceFiles).toBeGreaterThan(0);

        // Run 2: re-import the identical, unchanged foreign input under fs instrumentation.
        const mutations: FsMutation[] = [];
        const restore = instrumentFsMutations(mutations);
        try {
          const run2 = importRun({ projectRoot: root, overwrite: true });
          expect(run2.resolvedFormat).toBe(fixture.id);
        } finally {
          restore();
        }

        const after = snapshotTree(sourceRoot);
        const changedPaths = diffTrees(before, after);
        // The second run may re-write source files (overwrite) but MUST land
        // byte-identical content — the instrumentation proves writes occurred while
        // the tree diff proves none of them changed anything.
        const secondRunSourceWrites = mutations.filter(
          (m) => m.op === 'writeFileSync' || m.op === 'renameSync',
        ).length;

        perTarget.push({
          target: fixture.id,
          firstRunSourceFiles,
          secondRunSourceWrites,
          secondRunChangedFiles: changedPaths.length,
          changedPaths,
          idempotent: changedPaths.length === 0,
        });

        // The measurable idempotency target: 0 changed source files on the second run.
        expect(changedPaths).toEqual([]);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
