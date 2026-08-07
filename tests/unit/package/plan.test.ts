import { planPackageDeploy } from '../../../src/package/plan';
import { enumeratePackageSource } from '../../../src/package/enumerate';
import { GuardedFs } from '../../../src/write/guarded-fs';
import { Manifest } from '../../../src/manifest/manifest';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('planPackageDeploy (T-007, FR-015..FR-024)', () => {
  let t: TempRoot;
  let fsGate: GuardedFs;

  beforeEach(() => {
    t = makeTempRoot();
    fsGate = new GuardedFs(t.root);
    t.write('pkg/commands/foo.md', 'hello');
    t.write('pkg/scripts/build.sh', '#!/bin/sh');
  });
  afterEach(() => t.cleanup());

  function plan(priorManifest = Manifest.empty(fsGate)) {
    const enumerated = enumeratePackageSource(t.p('pkg'));
    return planPackageDeploy({
      fsGate,
      priorManifest,
      packageId: 'my-pkg',
      destinationRoot: 'dest',
      neutralFiles: enumerated.neutralFiles,
      runtimeFiles: enumerated.runtimeFiles,
    });
  }

  it('AC-006/AC-007/AC-039: classifies every file into 1 of 4 states', () => {
    const p = plan();
    expect(p.writes).toHaveLength(2);
    expect(p.writes.every((w) => w.changeType === 'create')).toBe(true);
  });

  it('AC-040: uses the same content-hash comparison approach as render-target classification', () => {
    t.write('dest/commands/foo.md', 'hello'); // byte-identical to source
    const p = plan();
    const foo = p.writes.find((w) => w.path === 'dest/commands/foo.md')!;
    expect(foo.changeType).toBe('unchanged');
  });

  it('classifies a managed, content-differing file as overwrite with backup needed', () => {
    const manifest = Manifest.empty(fsGate);
    manifest.record('my-pkg', 'dest/commands/foo.md', 'stale-hash');
    t.write('dest/commands/foo.md', 'stale content');
    const p = plan(manifest);
    const foo = p.writes.find((w) => w.path === 'dest/commands/foo.md')!;
    expect(foo.changeType).toBe('overwrite');
    expect(foo.backupNeeded).toBe(true);
  });

  it('AC-009: a Foreign Path (unmanaged, content-differing) is never targeted for a write', () => {
    t.write('dest/commands/foo.md', 'someone elses content');
    const p = plan();
    expect(p.writes.find((w) => w.path === 'dest/commands/foo.md')).toBeUndefined();
  });

  it('AC-008: reconcile removes exactly the orphaned set on redeploy, 0 other files touched', () => {
    const manifest = Manifest.empty(fsGate);
    manifest.record('my-pkg', 'dest/commands/foo.md', 'h1');
    manifest.record('my-pkg', 'dest/scripts/old.sh', 'h2');
    manifest.record('other-target', 'dest/scripts/keep.sh', 'h3');
    const p = plan(manifest);
    expect(p.removals).toEqual([{ targetId: 'my-pkg', path: 'dest/scripts/old.sh' }]);
  });

  it('AC-054: reconcile-to-empty-source removes 100% of prior files, 0 foreign paths touched', () => {
    const manifest = Manifest.empty(fsGate);
    manifest.record('my-pkg', 'dest/commands/foo.md', 'h1');
    manifest.record('my-pkg', 'dest/scripts/build.sh', 'h2');
    manifest.record('other-target', 'dest/rules/keep.md', 'h3');
    const enumerated = enumeratePackageSource(t.p('nonexistent-empty-pkg'));
    const p = planPackageDeploy({
      fsGate,
      priorManifest: manifest,
      packageId: 'my-pkg',
      destinationRoot: 'dest',
      neutralFiles: enumerated.neutralFiles,
      runtimeFiles: enumerated.runtimeFiles,
    });
    expect(p.removals.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { targetId: 'my-pkg', path: 'dest/commands/foo.md' },
      { targetId: 'my-pkg', path: 'dest/scripts/build.sh' },
    ]);
  });
});
