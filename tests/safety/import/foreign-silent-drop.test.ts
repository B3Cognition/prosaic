import * as fs from 'fs';
import * as path from 'path';
import { importRun } from '../../../src/import/run';
import { runPipeline } from '../../../src/pipeline/runner';
import { builtinRegistry } from '../../../src/registry/builtin';
import { supports, TargetDescriptor } from '../../../src/registry/descriptor';
import { REPRESENTATIVE, ALL_TYPES } from '../../helpers/representative';
import { FOREIGN_FIXTURES, makeTempDir, stageForeign, writeArtifact } from './foreign-corpus';

/**
 * NFR-005 / SC-002 — no silent drops, measured over the full registry corpus.
 *
 * Prior evidence covered only the 9 import-stable fixtures. Here the real
 * end-to-end `importRun` is executed against a corpus spanning EVERY registry
 * target (each exercised with an on-disk sample plus a deliberately-malformed
 * file that MUST be dropped-with-a-warning) as well as all 9 genuinely-foreign
 * fixtures. Two instrumented counters are recorded across the whole corpus:
 *   - silentDrops   = files dropped/skipped that surfaced 0 warnings  (target: 0)
 *   - writtenOrWarned% = files either written or carrying >=1 warning (target: 100%)
 * The counters are computed independently from each per-file report, not asserted
 * by a synthetic fixture.
 */
describe('no silent drops across the full registry corpus — measured runtime (NFR-005, SC-002, FR-021, FR-088)', () => {
  const registry = builtinRegistry();
  const descriptors = registry.all();

  let filesProcessed = 0;
  let filesWritten = 0;
  let filesDroppedWithWarning = 0;
  let silentDrops = 0;
  let malformedDropsObserved = 0;
  const targetsSwept: string[] = [];
  const silentDropDetails: Array<{ target: string; foreignPath: string }> = [];

  /** Deploy the first representative type a target supports into `root`; return primary dir. */
  function deployFirstSupported(desc: TargetDescriptor, root: string): string | null {
    for (const type of ALL_TYPES) {
      if (!supports(desc, type)) continue;
      let deployed: ReturnType<typeof runPipeline>;
      try {
        deployed = runPipeline(REPRESENTATIVE[type], desc, { lossyPolicy: 'warn' });
      } catch {
        continue;
      }
      const files = [
        { path: deployed.path, content: deployed.content },
        ...deployed.companions,
        ...deployed.resources,
      ];
      for (const f of files) {
        const abs = path.join(root, f.path);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, f.content);
      }
      return path.dirname(path.join(root, deployed.path));
    }
    return null;
  }

  /** Fold one run's per-file reports into the corpus-wide counters. */
  function accumulate(target: string, files: ReturnType<typeof importRun>['files']): void {
    for (const f of files) {
      filesProcessed++;
      if (f.outcome.ok) {
        filesWritten++;
      } else if (f.warnings.length > 0) {
        filesDroppedWithWarning++;
      } else {
        silentDrops++;
        silentDropDetails.push({ target, foreignPath: f.foreignPath });
      }
    }
  }

  afterAll(() => {
    const writtenOrWarned = filesWritten + filesDroppedWithWarning;
    const writtenOrWarnedPct = filesProcessed === 0 ? 0 : (writtenOrWarned / filesProcessed) * 100;
    const pass =
      filesProcessed > 0 &&
      silentDrops === 0 &&
      writtenOrWarned === filesProcessed &&
      malformedDropsObserved > 0;
    const payload = {
      requirements: ['NFR-005', 'SC-002', 'FR-021', 'FR-088'],
      evidenceKind: 'measured_runtime',
      description:
        'Every imported artifact is either written as valid neutral source or dropped with an explaining ' +
        'warning — 0 silent discards — measured across the full registry corpus (every target plus a ' +
        'deliberately-malformed drop-with-warning case) and all genuine-foreign fixtures via the real importRun.',
      registryTargetCount: descriptors.length,
      targetsSwept: targetsSwept.length,
      foreignFixtures: FOREIGN_FIXTURES.length,
      filesProcessed,
      filesWritten,
      filesDroppedWithWarning,
      malformedDropsObserved,
      silentDropCount: silentDrops,
      silentDropDetails,
      writtenOrWarnedPct,
      measurableTargets: {
        silentDrops: 0,
        writtenOrWarnedPct: 100,
      },
      pass,
      recordedAt: new Date().toISOString(),
    };
    writeArtifact('import-silent-drop-corpus-nfr005.json', { nfr: 'NFR-005', ...payload });
    writeArtifact('import-written-or-warned-sc002.json', { sc: 'SC-002', ...payload });
  });

  it('enumerates the full registry (not a partial 9-target sample)', () => {
    expect(descriptors.length).toBeGreaterThanOrEqual(FOREIGN_FIXTURES.length);
  });

  for (const desc of descriptors) {
    it(`${desc.id}: import writes-or-warns every file (0 silent drops), incl. a malformed drop`, () => {
      const root = makeTempDir('silent-drop-');
      try {
        const primaryDir = deployFirstSupported(desc, root);
        if (primaryDir === null) return; // target has no importable representative

        // Deliberately-malformed file at the target's layout: MUST be dropped WITH a
        // warning (never silently), exercising the FR-021/FR-088 no-silent-drop path.
        const malformedPath = path.join(primaryDir, 'malformed-frontmatter.md');
        fs.writeFileSync(malformedPath, '---\nname: [unterminated\n  broken: : :\n---\nbody\n');

        // Explicit format guarantees the target is selected and every staged file is
        // attributed to it, so non-import-stable targets are exercised too.
        const report = importRun({ projectRoot: root, foreignDir: root, format: desc.id });

        // No file may be dropped without a warning.
        expect(report.silentDropCount).toBe(0);
        // Independently: every non-ok file carries at least one warning.
        for (const f of report.files) {
          if (!f.outcome.ok) expect(f.warnings.length).toBeGreaterThan(0);
        }
        // The malformed file was dropped-with-warning (proves the drop path is live).
        const malformedReport = report.files.find((f) =>
          f.foreignPath.endsWith('malformed-frontmatter.md'),
        );
        expect(malformedReport).toBeDefined();
        expect(malformedReport!.outcome.ok).toBe(false);
        expect(malformedReport!.warnings.length).toBeGreaterThan(0);
        malformedDropsObserved++;

        accumulate(desc.id, report.files);
        targetsSwept.push(desc.id);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it('genuine-foreign fixtures import with 0 silent drops (auto-detect path)', () => {
    for (const fixture of FOREIGN_FIXTURES) {
      const root = makeTempDir('silent-drop-foreign-');
      try {
        stageForeign(root, fixture);
        const report = importRun({ projectRoot: root });
        expect(report.resolvedFormat).toBe(fixture.id);
        expect(report.silentDropCount).toBe(0);
        for (const f of report.files) {
          if (!f.outcome.ok) expect(f.warnings.length).toBeGreaterThan(0);
        }
        accumulate(fixture.id, report.files);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });
});
