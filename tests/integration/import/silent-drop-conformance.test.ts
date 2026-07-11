import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { importRun } from '../../../src/import/run';
import { runPipeline } from '../../../src/pipeline/runner';
import { ALL_DESCRIPTORS } from '../../../src/registry/adapters';
import { IMPORT_STABLE_TARGETS } from '../../../src/import/detect/parity';
import { Artifact } from '../../../src/domain/types';
import { FileReport } from '../../../src/import/types';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'import-silent-drop-nfr005.json');

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silent-drop-conform-')));
}

/** Same universal conformance fixture used by import-roundtrip-sc003 / import-conformance-nfr008. */
function makeConformanceArtifact(name: string): Artifact {
  return {
    id: `rules/${name}.md`,
    type: 'rule',
    frontmatter: { name, description: `Conformance rule for ${name}` },
    body: `# ${name}\n\nThis is a conformance fixture rule.\n`,
    sourcePath: `rules/${name}.md`,
  };
}

/** A silent drop is a dropped/skipped file that surfaced 0 warnings (FR-022, NFR-005). */
function silentDrops(files: FileReport[]): FileReport[] {
  return files.filter((f) => !f.outcome.ok && f.warnings.length === 0);
}

describe('zero silent drops across the import conformance fixture set (FR-022, NFR-005, SC-002)', () => {
  // The conformance fixture set = every import-stable target, deployed with a
  // prosaic-generated fixture and re-imported end-to-end (real drop accounting).
  const stableTargets = ALL_DESCRIPTORS.filter((d) => IMPORT_STABLE_TARGETS.has(d.id));

  let totalSilentDrops = 0;
  let totalFilesChecked = 0;
  let fixturesChecked = 0;

  afterAll(() => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-005',
          description:
            'Zero silent drops measured over the import conformance fixture set: every dropped/skipped file surfaces at least one warning',
          fixturesChecked,
          filesChecked: totalFilesChecked,
          silentDropCount: totalSilentDrops,
          pass: totalSilentDrops === 0 && fixturesChecked >= IMPORT_STABLE_TARGETS.size,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  it('exercises the full import-stable target set (not a 2-fixture synthetic sample)', () => {
    expect(stableTargets.length).toBe(IMPORT_STABLE_TARGETS.size);
    expect(stableTargets.length).toBeGreaterThanOrEqual(9);
  });

  for (const desc of stableTargets) {
    it(`${desc.id}: import surfaces a warning for every dropped file (0 silent drops)`, () => {
      const root = makeTempDir();
      try {
        const artifact = makeConformanceArtifact(`conform-${desc.id.replace(/[^a-z0-9]/g, '-')}`);

        let deployed: ReturnType<typeof runPipeline>;
        try {
          deployed = runPipeline(artifact, desc, { lossyPolicy: 'warn' });
        } catch {
          // Target may not support rules — no fixture to check.
          return;
        }

        const filePath = path.join(root, deployed.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, deployed.content);

        const report = importRun({ projectRoot: root, foreignDir: root, format: desc.id });

        fixturesChecked++;
        totalFilesChecked += report.files.length;
        const drops = silentDrops(report.files);
        totalSilentDrops += drops.length;

        // Every dropped/skipped file must carry at least one warning.
        expect(drops).toEqual([]);
        expect(report.silentDropCount).toBe(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
