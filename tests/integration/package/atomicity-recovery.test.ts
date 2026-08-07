import { spawnSync } from 'child_process';
import * as path from 'path';
import { deployPackage } from '../../../src/package/run';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

const HARNESS = path.join(__dirname, 'crash-harness.js');

function runHarness(t: TempRoot, crashAfterRenames: number): void {
  spawnSync(process.execPath, [HARNESS], {
    env: {
      ...process.env,
      PROSAIC_TEST_PROJECT_ROOT: t.root,
      PROSAIC_TEST_PACKAGE_ID: 'my-pkg',
      PROSAIC_TEST_CRASH_AFTER_RENAMES: String(crashAfterRenames),
    },
  });
}

function seed(t: TempRoot): void {
  t.write('pkg/commands/a.md', 'a-content');
  t.write('pkg/commands/b.md', 'b-content');
  t.write('pkg/scripts/c.sh', 'c-content');
  t.write(
    'prosaic.config.yaml',
    'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
  );
}

describe('atomicity recovery: process-kill at rename boundary (T-015, FR-018/FR-042/NFR-004)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seed(t);
  });
  afterEach(() => t.cleanup());

  function expectZeroFilesFromDeployment(t: TempRoot): void {
    // A crash before any commit rename may still leave an empty directory
    // stub behind (mkdirSync precedes the rename it prepares for) — the
    // atomicity guarantee (FR-018) is 0 files from the interrupted
    // deployment, not the literal absence of an empty directory.
    expect(t.exists('dest/commands/a.md')).toBe(false);
    expect(t.exists('dest/commands/b.md')).toBe(false);
    expect(t.exists('dest/scripts/c.sh')).toBe(false);
  }

  it('AC-004: kill during staging (before any commit rename) leaves the destination 100% pre-deployment', () => {
    // 3 files → 3 staging renames precede any commit rename; kill after the 1st.
    runHarness(t, 1);
    expectZeroFilesFromDeployment(t);

    const report = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    expect(report.created).toBe(3);
    expect(t.read('dest/commands/a.md')).toBe('a-content');
    expect(t.read('dest/commands/b.md')).toBe('b-content');
    expect(t.read('dest/scripts/c.sh')).toBe('c-content');
  });

  it('AC-004: kill exactly at the staging/commit boundary leaves the destination 100% pre-deployment', () => {
    runHarness(t, 3); // all 3 staging renames complete; 0 commit renames begin.
    expectZeroFilesFromDeployment(t);

    const report = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    expect(report.created).toBe(3);
  });

  it.each([4, 5])(
    'AC-023: kill mid-commit (after %i of 6 renames) converges via exactly 1 subsequent re-run, 0 manual repair',
    (crashAfterRenames) => {
      runHarness(t, crashAfterRenames);

      // Exactly 1 subsequent full deployment converges the project.
      const report = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });

      expect(t.read('dest/commands/a.md')).toBe('a-content');
      expect(t.read('dest/commands/b.md')).toBe('b-content');
      expect(t.read('dest/scripts/c.sh')).toBe('c-content');

      // A further no-op re-run confirms full convergence (no lingering drift).
      const stable = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
      expect(stable.created).toBe(0);
      expect(stable.overwritten).toBe(0);
      expect(stable.removed).toBe(0);
      expect(stable.unchanged).toBe(3);
      void report;
    },
  );
});
