import * as fs from 'fs';
import { deployPackage } from '../../../src/package/run';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('package reconcile-on-redeploy removes obsolete files (T-030, FR-021)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('AC-008: a single obsolete file is removed on redeploy, 0 other files removed', () => {
    t.write('pkg/commands/deploy.md', 'x');
    t.write('pkg/scripts/old.sh', 'stale');
    t.write(
      'prosaic.config.yaml',
      'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
    );
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    expect(t.exists('dest/scripts/old.sh')).toBe(true);

    fs.rmSync(t.p('pkg/scripts/old.sh'));
    const report = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });

    expect(report.removed).toBe(1);
    expect(t.exists('dest/scripts/old.sh')).toBe(false);
    expect(t.exists('dest/commands/deploy.md')).toBe(true);
  });

  it('AC-054: redeploying an emptied source removes 100% of the package files, 0 foreign paths touched', () => {
    t.write('pkg/commands/deploy.md', 'x');
    t.write('pkg/scripts/build.sh', 'y');
    t.write('dest/foreign.md', 'not managed by this package');
    t.write(
      'prosaic.config.yaml',
      'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
    );
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    expect(t.exists('dest/commands/deploy.md')).toBe(true);
    expect(t.exists('dest/scripts/build.sh')).toBe(true);

    fs.rmSync(t.p('pkg/commands/deploy.md'));
    fs.rmSync(t.p('pkg/scripts/build.sh'));
    const report = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });

    expect(report.removed).toBe(2);
    expect(t.exists('dest/commands/deploy.md')).toBe(false);
    expect(t.exists('dest/scripts/build.sh')).toBe(false);
    expect(t.exists('dest/foreign.md')).toBe(true);
    expect(t.read('dest/foreign.md')).toBe('not managed by this package');
  });
});
