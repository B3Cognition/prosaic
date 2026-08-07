import { deployPackage, revertPackage } from '../../../src/package/run';
import { UnknownPackageError } from '../../../src/package/errors';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

function seed(t: TempRoot): void {
  t.write('pkg/commands/deploy.md', 'x');
  t.write('pkg/scripts/build.sh', 'y');
  t.write(
    'prosaic.config.yaml',
    'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
  );
}

describe('revertPackage (T-022, FR-023, Should-Have)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seed(t);
  });
  afterEach(() => t.cleanup());

  it('AC-011: revert removes exactly the declared package files, 0 foreign paths touched', () => {
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    t.write('dest/foreign.md', 'not managed');

    const report = revertPackage({ projectRoot: t.root, packageId: 'my-pkg' });

    expect(report.removed).toBe(2);
    expect(t.exists('dest/commands/deploy.md')).toBe(false);
    expect(t.exists('dest/scripts/build.sh')).toBe(false);
    expect(t.exists('dest/foreign.md')).toBe(true);
  });

  it('dry-run previews removals and deletes 0', () => {
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    const report = revertPackage({ projectRoot: t.root, packageId: 'my-pkg', dryRun: true });
    expect(report.removed).toBe(0);
    expect(t.exists('dest/commands/deploy.md')).toBe(true);
  });

  it('an unknown package id throws before touching the manifest', () => {
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    expect(() => revertPackage({ projectRoot: t.root, packageId: 'ghost' })).toThrow(
      UnknownPackageError,
    );
    expect(t.exists('dest/commands/deploy.md')).toBe(true);
  });
});
