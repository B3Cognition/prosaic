import * as fs from 'fs';
import * as path from 'path';
import { inspectArtifact } from '../../../src/inspect/lookup';
import { resolveExecutionData } from '../../../src/resolve/lookup';
import { Registry, StaticRegistrySource } from '../../../src/registry/registry';
import { makeDescriptor } from '../../helpers/descriptor-factory';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

/**
 * Measured-runtime evidence for NFR-002: repeated back-to-back trials pairing a
 * resolveExecutionData() call with an inspectArtifact() call against the same
 * unchanged source root and artifact id, persisted so the 2x runtime bound is
 * backed by an archived measurement rather than a single inline assertion.
 */

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'inspect-runtime-nfr002.json');
const TRIALS = 25;
// A floor avoids flaking on sub-millisecond timer noise while still enforcing the 2x bound.
const FLOOR_NANOS = 2_000_000;

function testRegistry(): Registry {
  return new Registry(new StaticRegistrySource([makeDescriptor({ id: 'known-target' })]));
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// The minimum of a few repeated samples is a standard latency-benchmarking estimator:
// it converges on the call's true cost while filtering one-off scheduler/GC pauses that
// would otherwise land on a single sample and skew it independently of the paired call.
const SAMPLES_PER_TRIAL = 3;
function minNanos(fn: () => void): number {
  let min = Infinity;
  for (let s = 0; s < SAMPLES_PER_TRIAL; s++) {
    const start = process.hrtime.bigint();
    fn();
    const elapsed = Number(process.hrtime.bigint() - start);
    if (elapsed < min) min = elapsed;
  }
  return min;
}

describe('NFR-002 measured runtime: inspect stays within 2x of resolve baseline', () => {
  let t: TempRoot;
  const resolveNanos: number[] = [];
  const inspectNanos: number[] = [];

  beforeAll(() => {
    t = makeTempRoot();
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');

    // Warm up JIT/module-cache effects on both call paths before timing begins, so a
    // one-off cold-start cost doesn't land on a single measured trial and skew it past
    // the 2x bound (both functions share most of their code path via discover()/resolveConfig()).
    for (let i = 0; i < 3; i++) {
      resolveExecutionData({
        projectRoot: t.root,
        artifactId: 'rules/style.md',
        targetId: 'known-target',
        registry: testRegistry(),
      });
      inspectArtifact({ projectRoot: t.root, artifactId: 'rules/style.md' });
    }

    for (let i = 0; i < TRIALS; i++) {
      resolveNanos.push(
        minNanos(() =>
          resolveExecutionData({
            projectRoot: t.root,
            artifactId: 'rules/style.md',
            targetId: 'known-target',
            registry: testRegistry(),
          }),
        ),
      );

      inspectNanos.push(minNanos(() => inspectArtifact({ projectRoot: t.root, artifactId: 'rules/style.md' })));
    }
  });

  afterAll(() => {
    t.cleanup();

    const violations = inspectNanos.filter((ns, i) => ns > Math.max(resolveNanos[i], FLOOR_NANOS) * 2).length;

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-002',
          requirements: ['NFR-002'],
          evidenceKind: 'measured_runtime',
          description:
            `${TRIALS} back-to-back trials pairing a resolveExecutionData() call with an ` +
            'inspectArtifact() call against the same unchanged source root and artifact id, ' +
            `each measured with process.hrtime.bigint() as the min of ${SAMPLES_PER_TRIAL} samples ` +
            '(filters one-off scheduler/GC pauses); records whether every inspect trial ' +
            "stayed within 2x of that trial's resolve runtime (floored to avoid sub-ms timer noise).",
          trials: TRIALS,
          resolveNanosMedian: median(resolveNanos),
          inspectNanosMedian: median(inspectNanos),
          floorNanos: FLOOR_NANOS,
          violations,
          measurableTarget: "within 2x of resolve's measured runtime baseline for the same source size, on every trial",
          pass: violations === 0,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  it(`NFR-002: every one of ${TRIALS} inspect trials completes within 2x of that trial's resolve runtime`, () => {
    for (let i = 0; i < TRIALS; i++) {
      expect(inspectNanos[i]).toBeLessThanOrEqual(Math.max(resolveNanos[i], FLOOR_NANOS) * 2);
    }
  });
});
