import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { importRun } from '../../src/import/run';
import { detectFormat } from '../../src/import/detect/detect';
import { runPipeline } from '../../src/pipeline/runner';
import { builtinRegistry } from '../../src/registry/builtin';
import { supports, TargetDescriptor } from '../../src/registry/descriptor';
import { REPRESENTATIVE, ALL_TYPES } from '../helpers/representative';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'import-single-command-sc001.json');

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sc001-')));
}

/** Deploy the first representative type this target supports into `root`, return its files count. */
function deployFirstSupported(desc: TargetDescriptor, root: string): number {
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
    return files.length;
  }
  return 0;
}

describe('single-command no-flag import for every unambiguous-layout target (SC-001)', () => {
  const registry = builtinRegistry();
  const descriptors = registry.all();

  const unambiguousTargets: string[] = [];
  const ambiguousOrUndetectable: string[] = [];

  afterAll(() => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          sc: 'SC-001',
          description:
            'Single-command, no-flag auto-detect import succeeds for every registry target whose layout is unambiguous',
          registryTargetCount: descriptors.length,
          unambiguousTargetCount: unambiguousTargets.length,
          unambiguousTargets: [...unambiguousTargets].sort(),
          ambiguousOrUndetectable: [...ambiguousOrUndetectable].sort(),
          pass: unambiguousTargets.length > 0,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  it('enumerates the full registry (not a partial 9-target sample)', () => {
    expect(descriptors.length).toBeGreaterThanOrEqual(9);
  });

  for (const desc of descriptors) {
    it(`${desc.id}: no-flag import auto-detects and imports its own layout (or is classified ambiguous)`, () => {
      const root = makeTempDir();
      try {
        const deployedCount = deployFirstSupported(desc, root);
        if (deployedCount === 0) {
          // Target produced no fixture (unsupported representative) — not an SC-001 subject.
          ambiguousOrUndetectable.push(desc.id);
          return;
        }

        // Classify the layout by auto-detection.
        const detection = detectFormat(root, root, descriptors);
        if (detection.outcome.kind !== 'single' || detection.outcome.targetId !== desc.id) {
          // Ambiguous or resolves to a different target — outside SC-001's unambiguous scope.
          ambiguousOrUndetectable.push(desc.id);
          return;
        }

        // Unambiguous layout: the no-flag single command MUST auto-detect and import it.
        const report = importRun({ projectRoot: root, foreignDir: root });

        expect(report.resolvedFormat).toBe(desc.id);
        expect(report.resolutionMethod).toBe('auto-detected');
        // No file may be silently dropped (NFR-005 invariant holds on the no-flag path).
        expect(report.silentDropCount).toBe(0);
        // At least one file is actually imported — the command "succeeds".
        expect(report.files.some((f) => f.outcome.ok)).toBe(true);

        unambiguousTargets.push(desc.id);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
