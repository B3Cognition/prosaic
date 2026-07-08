import * as fs from 'fs';
import * as path from 'path';
import { apply } from '../../src/lifecycle/run';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedCorpus, syntheticRegistry } from '../helpers/corpus';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'benchmark-nfr005.json');

describe('performance benchmark (T-038, NFR-005)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('distributes 100 artifacts across 30 targets in under 30 seconds', () => {
    seedCorpus(t, 100);
    const registry = syntheticRegistry(30);

    const start = Date.now();
    const report = apply({ projectRoot: t.root, registry });
    const elapsedMs = Date.now() - start;

    // Emit measured timing artifact so CI can archive it as build evidence (NFR-005).
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-005',
          description: '100 artifacts × 30 targets distribution time',
          artifactCount: 100,
          targetCount: 30,
          outputCount: report.created,
          elapsedMs,
          thresholdMs: 30_000,
          pass: elapsedMs < 30_000,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    // 100 artifacts × 30 targets = 3000 outputs.
    expect(report.created).toBe(3000);
    expect(elapsedMs).toBeLessThan(30_000);
  });
});
