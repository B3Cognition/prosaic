import { apply } from '../../src/lifecycle/run';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedCorpus, syntheticRegistry } from '../helpers/corpus';

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

    // 100 artifacts × 30 targets = 3000 outputs.
    expect(report.created).toBe(3000);
    expect(elapsedMs).toBeLessThan(30_000);
  });
});
