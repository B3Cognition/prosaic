import { stagePackageWrites, stagingPathFor } from '../../../src/package/stage';
import { GuardedFs } from '../../../src/write/guarded-fs';
import { RunPlan } from '../../../src/lifecycle/plan';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

function plan(writes: RunPlan['writes']): RunPlan {
  return { writes, removals: [], warnings: [] };
}

describe('stagePackageWrites (T-008, FR-018/FR-042)', () => {
  let t: TempRoot;
  let fsGate: GuardedFs;

  beforeEach(() => {
    t = makeTempRoot();
    fsGate = new GuardedFs(t.root);
  });
  afterEach(() => t.cleanup());

  it('AC-004/AC-023: writes full content to staging, destination untouched', () => {
    const p = plan([
      {
        targetId: 'pkg',
        path: 'dest/commands/foo.md',
        content: 'hello',
        hash: 'h',
        changeType: 'create',
        backupNeeded: false,
      },
    ]);
    stagePackageWrites(p, fsGate, 'pkg');
    expect(t.exists('dest/commands/foo.md')).toBe(false);
    expect(t.read(stagingPathFor('pkg', 'dest/commands/foo.md'))).toBe('hello');
  });

  it('skips unchanged entries', () => {
    const p = plan([
      {
        targetId: 'pkg',
        path: 'dest/commands/foo.md',
        content: 'hello',
        hash: 'h',
        changeType: 'unchanged',
        backupNeeded: false,
      },
    ]);
    stagePackageWrites(p, fsGate, 'pkg');
    expect(t.exists(stagingPathFor('pkg', 'dest/commands/foo.md'))).toBe(false);
  });

  it('clears a stale per-package staging subdirectory left from a prior crash before writing', () => {
    t.write(stagingPathFor('pkg', 'dest/old-leftover.md'), 'stale');
    const p = plan([
      {
        targetId: 'pkg',
        path: 'dest/commands/foo.md',
        content: 'fresh',
        hash: 'h',
        changeType: 'create',
        backupNeeded: false,
      },
    ]);
    stagePackageWrites(p, fsGate, 'pkg');
    expect(t.exists(stagingPathFor('pkg', 'dest/old-leftover.md'))).toBe(false);
    expect(t.read(stagingPathFor('pkg', 'dest/commands/foo.md'))).toBe('fresh');
  });

  it('leaves a sibling package staging subdirectory untouched', () => {
    t.write(stagingPathFor('other-pkg', 'dest/keep.md'), 'keep-me');
    stagePackageWrites(plan([]), fsGate, 'pkg');
    expect(t.exists(stagingPathFor('other-pkg', 'dest/keep.md'))).toBe(true);
  });
});
