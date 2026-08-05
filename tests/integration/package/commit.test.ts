import { commitPackageDeploy } from '../../../src/package/commit';
import { stagePackageWrites, stagingPathFor } from '../../../src/package/stage';
import { GuardedFs } from '../../../src/write/guarded-fs';
import { BackupManager } from '../../../src/write/backup';
import { Manifest } from '../../../src/manifest/manifest';
import { RunPlan, PlannedWrite } from '../../../src/lifecycle/plan';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('commitPackageDeploy (T-009, FR-018/FR-029/FR-042)', () => {
  let t: TempRoot;
  let fsGate: GuardedFs;
  let backups: BackupManager;

  beforeEach(() => {
    t = makeTempRoot();
    fsGate = new GuardedFs(t.root);
    backups = new BackupManager(fsGate);
  });
  afterEach(() => t.cleanup());

  function write(over: Partial<PlannedWrite>): PlannedWrite {
    return {
      targetId: 'pkg',
      path: 'dest/commands/foo.md',
      content: 'hello',
      hash: 'h',
      changeType: 'create',
      backupNeeded: false,
      ...over,
    };
  }

  it('commits a create by moving the staged file into place and recording provenance', () => {
    const manifest = Manifest.empty(fsGate);
    const plan: RunPlan = { writes: [write({})], removals: [], warnings: [] };
    stagePackageWrites(plan, fsGate, 'pkg');
    const result = commitPackageDeploy(plan, fsGate, manifest, backups, 'pkg');
    expect(result.created).toBe(1);
    expect(t.read('dest/commands/foo.md')).toBe('hello');
    expect(t.exists(stagingPathFor('pkg', 'dest/commands/foo.md'))).toBe(false);
    expect(manifest.isManaged('pkg', 'dest/commands/foo.md')).toBe(true);
  });

  it('backs up content-changing overwrite before the rename', () => {
    t.write('dest/commands/foo.md', 'old content');
    const manifest = Manifest.empty(fsGate);
    manifest.record('pkg', 'dest/commands/foo.md', 'old-hash');
    const plan: RunPlan = {
      writes: [write({ content: 'new content', changeType: 'overwrite', backupNeeded: true })],
      removals: [],
      warnings: [],
    };
    stagePackageWrites(plan, fsGate, 'pkg');
    const result = commitPackageDeploy(plan, fsGate, manifest, backups, 'pkg');
    expect(result.overwritten).toBe(1);
    expect(result.backedUp).toBe(1);
    expect(t.read('dest/commands/foo.md')).toBe('new content');
    expect(t.exists('.prosaic-backups')).toBe(true);
  });

  it('4+ successive overwrites of the same file retain exactly 3 backups', () => {
    t.write('dest/commands/foo.md', 'v0');
    const manifest = Manifest.empty(fsGate);
    manifest.record('pkg', 'dest/commands/foo.md', 'v0-hash');
    for (let i = 1; i <= 5; i++) {
      const plan: RunPlan = {
        writes: [write({ content: `v${i}`, hash: `v${i}-hash`, changeType: 'overwrite', backupNeeded: true })],
        removals: [],
        warnings: [],
      };
      stagePackageWrites(plan, fsGate, 'pkg');
      commitPackageDeploy(plan, fsGate, manifest, backups, 'pkg');
    }
    expect(backups.listBackups(t.p('dest/commands/foo.md'))).toHaveLength(3);
  });

  it('applies removals and updates the manifest', () => {
    const manifest = Manifest.empty(fsGate);
    manifest.record('pkg', 'dest/scripts/old.sh', 'h');
    t.write('dest/scripts/old.sh', 'stale');
    const plan: RunPlan = {
      writes: [],
      removals: [{ targetId: 'pkg', path: 'dest/scripts/old.sh' }],
      warnings: [],
    };
    const result = commitPackageDeploy(plan, fsGate, manifest, backups, 'pkg');
    expect(result.removed).toBe(1);
    expect(t.exists('dest/scripts/old.sh')).toBe(false);
    expect(manifest.isManaged('pkg', 'dest/scripts/old.sh')).toBe(false);
  });

  it('calls manifest.save() exactly once, after every rename/delete completes', () => {
    const manifest = Manifest.empty(fsGate);
    const saveSpy = jest.spyOn(manifest, 'save');
    const plan: RunPlan = {
      writes: [write({})],
      removals: [],
      warnings: [],
    };
    stagePackageWrites(plan, fsGate, 'pkg');
    commitPackageDeploy(plan, fsGate, manifest, backups, 'pkg');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(t.exists('.prosaic-manifest.json')).toBe(true);
  });
});
