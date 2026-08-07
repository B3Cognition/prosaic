import { commitPackageDeploy } from '../../../src/package/commit';
import { stagePackageWrites } from '../../../src/package/stage';
import { GuardedFs } from '../../../src/write/guarded-fs';
import { BackupManager } from '../../../src/write/backup';
import { Manifest } from '../../../src/manifest/manifest';
import { RunPlan, PlannedWrite } from '../../../src/lifecycle/plan';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('commitPackageDeploy mode preservation gating (T-021, NFR-005)', () => {
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
      path: 'dest/scripts/run.sh',
      content: '#!/bin/sh\n',
      hash: 'h',
      changeType: 'create',
      backupNeeded: false,
      mode: 0o755,
      ...over,
    };
  }

  it('the mode-preservation step is skipped without error on a non-POSIX host', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const manifest = Manifest.empty(fsGate);
      const plan: RunPlan = { writes: [write({})], removals: [], warnings: [] };
      stagePackageWrites(plan, fsGate, 'pkg');
      expect(() => commitPackageDeploy(plan, fsGate, manifest, backups, 'pkg')).not.toThrow();
      expect(t.exists('dest/scripts/run.sh')).toBe(true);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('skips chmod for a write with no captured mode (Neutral Artifact Tree)', () => {
    const manifest = Manifest.empty(fsGate);
    const plan: RunPlan = {
      writes: [write({ path: 'dest/commands/foo.md', mode: undefined })],
      removals: [],
      warnings: [],
    };
    stagePackageWrites(plan, fsGate, 'pkg');
    expect(() => commitPackageDeploy(plan, fsGate, manifest, backups, 'pkg')).not.toThrow();
    expect(t.exists('dest/commands/foo.md')).toBe(true);
  });
});
