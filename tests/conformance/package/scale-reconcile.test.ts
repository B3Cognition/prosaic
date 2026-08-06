import * as fs from 'fs';
import { deployPackage } from '../../../src/package/run';
import { generateFixturePackage } from '../../helpers/package-fixture';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('conformance: 500-file fixture reconcile-to-empty-source (T-025, NFR-007)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('reconcile-to-empty-source removes 100% of the package files within the CI timeout budget', () => {
    generateFixturePackage(t, 'pkg', 500);
    t.write(
      'prosaic.config.yaml',
      'packages:\n  - id: scale-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
    );

    const first = deployPackage({ projectRoot: t.root, packageId: 'scale-pkg' });
    expect(first.created).toBe(500);

    fs.rmSync(t.p('pkg'), { recursive: true, force: true });
    fs.mkdirSync(t.p('pkg'), { recursive: true });

    const startedAt = performance.now();
    const second = deployPackage({ projectRoot: t.root, packageId: 'scale-pkg' });
    const elapsedMs = performance.now() - startedAt;

    expect(second.removed).toBe(500);
    // NFR-007: measured against an explicit numeric budget, well inside the 60s Jest testTimeout.
    expect(elapsedMs).toBeLessThan(30000);
  });
});
