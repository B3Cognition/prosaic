import { deployPackage } from '../../../src/package/run';
import { enumeratePackageSource } from '../../../src/package/enumerate';
import { generateFixturePackage } from '../../helpers/package-fixture';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('conformance: 500-file fixture deploy at scale (T-020, NFR-007)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('a 500-file fixture package deploys successfully within the CI timeout budget', () => {
    generateFixturePackage(t, 'pkg', 500);
    t.write(
      'prosaic.config.yaml',
      'packages:\n  - id: scale-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
    );

    const enumerated = enumeratePackageSource(t.p('pkg'));
    expect(enumerated.neutralFiles.length + enumerated.runtimeFiles.length).toBe(500);
    expect(enumerated.warnings).toHaveLength(0);

    const report = deployPackage({ projectRoot: t.root, packageId: 'scale-pkg' });
    expect(report.created).toBe(500);
  });
});
