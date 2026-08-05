import { deployPackage } from '../../../src/package/run';
import { UnknownPackageError } from '../../../src/package/errors';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

function seedProject(t: TempRoot): void {
  t.write('pkg/commands/deploy.md', '---\ndescription: deploy\n---\nRun.\n');
  t.write('pkg/scripts/build.sh', '#!/bin/sh\necho hi\n');
  t.write(
    'prosaic.config.yaml',
    'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
  );
}

describe('deployPackage (T-010, FR-005/FR-015/FR-047)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedProject(t);
  });
  afterEach(() => t.cleanup());

  it('AC-005/AC-039: dry-run against an empty destination reports 100% creates, writes 0 files', () => {
    const report = deployPackage({ projectRoot: t.root, packageId: 'my-pkg', dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.preview.some((l) => l.startsWith('create'))).toBe(true);
    expect(t.exists('dest/commands/deploy.md')).toBe(false);
    expect(t.exists('dest/scripts/build.sh')).toBe(false);
  });

  it('a real run creates every enumerated file and records provenance', () => {
    const report = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    expect(report.dryRun).toBe(false);
    expect(report.created).toBe(2);
    expect(t.exists('dest/commands/deploy.md')).toBe(true);
    expect(t.exists('dest/scripts/build.sh')).toBe(true);
  });

  it('AC-024: dry-run classification matches the real-run outcome for the identical input', () => {
    const dry = deployPackage({ projectRoot: t.root, packageId: 'my-pkg', dryRun: true });
    const real = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    const dryTypes = dry.plan.writes.map((w) => w.changeType).sort();
    const realTypes = real.plan.writes.map((w) => w.changeType).sort();
    expect(dryTypes).toEqual(realTypes);
  });

  it('AC-055: an unknown package id throws UnknownPackageError before enumeration/planning', () => {
    expect(() => deployPackage({ projectRoot: t.root, packageId: 'ghost' })).toThrow(
      UnknownPackageError,
    );
    expect(t.exists('dest')).toBe(false);
  });

  it('a no-op re-run reports 0 changed writes', () => {
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    const second = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    expect(second.created).toBe(0);
    expect(second.overwritten).toBe(0);
    expect(second.unchanged).toBe(2);
  });
});
