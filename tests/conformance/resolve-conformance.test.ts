import * as fs from 'fs';
import * as path from 'path';
import { resolveExecution } from '../../src/resolve/resolve-execution';
import { supports, TargetDescriptor } from '../../src/registry/descriptor';
import { builtinRegistry } from '../../src/registry/builtin';
import { REPRESENTATIVE, ALL_TYPES } from '../helpers/representative';
import { clusterOf } from '../helpers/clusters';

const FIXTURE_ROOT = path.join(__dirname, '..', '..', 'conformance-fixtures', 'resolve');
const UPDATE = process.env.UPDATE_FIXTURES === '1';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'resolve-conformance-nfr004.json');

// ---------------------------------------------------------------------------
// Measured-runtime evidence accumulators (populated while the suite runs).
// ---------------------------------------------------------------------------
let runtimeCapableTargetsTotal = 0;
let runtimeCapableTargetsCovered = 0;

/** Directory holding a target+type's golden resolved-execution-data fixture. */
function goldenDir(desc: TargetDescriptor, type: string): string {
  return path.join(FIXTURE_ROOT, clusterOf(desc.id), desc.id, type);
}

describe('T-010: per-target resolution conformance fixtures (FR-010, NFR-004)', () => {
  const registry = builtinRegistry();
  const descriptors = registry.all();

  afterAll(() => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-004',
          requirements: ['FR-010', 'NFR-004'],
          evidenceKind: 'measured_runtime',
          description:
            'Each runtime-capable target (every registered target × supported artifact type providing resolved ' +
            'execution data under FR-002) gains at least 1 automated fixture test pinning its expected resolved output.',
          runtimeCapableTargetsTotal,
          runtimeCapableTargetsCovered,
          coverage: runtimeCapableTargetsTotal > 0 ? runtimeCapableTargetsCovered / runtimeCapableTargetsTotal : 0,
          measurableTarget: '100% of runtime-capable targets have at least 1 passing fixture test.',
          pass: runtimeCapableTargetsTotal > 0 && runtimeCapableTargetsCovered === runtimeCapableTargetsTotal,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  for (const desc of descriptors) {
    for (const type of ALL_TYPES) {
      if (!supports(desc, type)) continue;

      it(`${desc.id} · ${type} resolution byte-matches its pinned fixture`, () => {
        runtimeCapableTargetsTotal += 1;
        const data = resolveExecution(REPRESENTATIVE[type], desc);
        const goldenPath = path.join(goldenDir(desc, type), 'resolved.json');
        const content = JSON.stringify(data, null, 2) + '\n';

        if (UPDATE || !fs.existsSync(goldenPath)) {
          fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
          fs.writeFileSync(goldenPath, content);
        }
        const golden = fs.readFileSync(goldenPath, 'utf8');
        expect(content).toBe(golden);

        // ADR-005: 0/40 targets populate `capability` today — pin `model` as
        // unresolved for every target so a future adapter change that adds a
        // `capability` rule surfaces as a visible, reviewed fixture diff.
        expect(data.model.status).toBe('unresolved');
        runtimeCapableTargetsCovered += 1;
      });
    }
  }

  it('touches 0 existing file-presentation conformance fixtures (FR-010)', () => {
    const presentationRoot = path.join(__dirname, '..', '..', 'conformance-fixtures');
    const entries = fs.readdirSync(presentationRoot);
    expect(entries).toContain('markdown-frontmatter');
    // The new fixture root is nested one level deeper than every existing
    // cluster directory, so it can never collide with a presentation fixture.
    expect(fs.existsSync(path.join(presentationRoot, 'markdown-frontmatter', 'resolved.json'))).toBe(false);
  });
});
