import * as fs from 'fs';
import { GuardedFs } from '../write/guarded-fs';
import { BackupManager } from '../write/backup';
import { Manifest, toRelPosix } from '../manifest/manifest';
import { RunPlan } from '../lifecycle/plan';
import { stagingPathFor } from './stage';

export interface PackageExecuteResult {
  created: number;
  overwritten: number;
  unchanged: number;
  removed: number;
  backedUp: number;
}

/**
 * Ordered commit sequence (ADR-007/008): for each create/overwrite, back up
 * first via the existing, unmodified BackupManager when the write is
 * content-changing (retaining up to 3 prior versions — FR-029, matching
 * existing render-target retention exactly), then `GuardedFs.moveFileAtomic`
 * (T-005) the staged content into place; then apply removals; then
 * `manifest.save()` exactly once, last. This ordering bounds the atomicity gap
 * to a metadata-only window of single-syscall renames/deletes — a crash
 * mid-commit is always fully recoverable via one idempotent re-run (NFR-004).
 */
export function commitPackageDeploy(
  plan: RunPlan,
  fsGate: GuardedFs,
  manifest: Manifest,
  backups: BackupManager,
  packageId: string,
): PackageExecuteResult {
  const result: PackageExecuteResult = {
    created: 0,
    overwritten: 0,
    unchanged: 0,
    removed: 0,
    backedUp: 0,
  };

  for (const w of plan.writes) {
    if (w.changeType === 'unchanged') {
      manifest.record(w.targetId, w.path, w.hash);
      result.unchanged += 1;
      continue;
    }

    if (w.backupNeeded) {
      const abs = fsGate.assertContained(w.path);
      backups.backup(abs);
      result.backedUp += 1;
    }

    fsGate.moveFileAtomic(stagingPathFor(packageId, w.path), w.path);

    // Preserve the Package Runtime Tree source's executable mode on POSIX
    // hosts (FR-013, Should-Have); Windows has no equivalent, so this step
    // is skipped there rather than silently assumed (NFR-005).
    if (w.mode !== undefined && process.platform !== 'win32') {
      fs.chmodSync(fsGate.assertContained(w.path), w.mode);
    }

    manifest.record(w.targetId, w.path, w.hash);
    if (w.changeType === 'create') result.created += 1;
    else result.overwritten += 1;
  }

  for (const r of plan.removals) {
    fsGate.deleteFile(r.path);
    manifest.remove(r.targetId, toRelPosix(fsGate.root, r.path));
    result.removed += 1;
  }

  manifest.save();
  return result;
}
