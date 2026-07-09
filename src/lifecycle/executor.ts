import * as path from 'path';
import { GuardedFs } from '../write/guarded-fs';
import { BackupManager } from '../write/backup';
import { Manifest, toRelPosix } from '../manifest/manifest';
import { RunPlan } from './plan';

export interface ExecuteResult {
  created: number;
  overwritten: number;
  unchanged: number;
  removed: number;
  backedUp: number;
}

/**
 * Execute an apply plan through the guarded filesystem (ADR-006). For every
 * content-changing overwrite of a managed file, a prior-content backup is
 * written first (FR-025, FR-056). Every generated file is recorded in the
 * manifest keyed by (target, path) (FR-024); orphan removals are applied; the
 * manifest is then saved atomically (NFR-012).
 *
 * All writes and deletes flow through GuardedFs so containment holds (NFR-003).
 */
export function executeApply(
  plan: RunPlan,
  fsGate: GuardedFs,
  manifest: Manifest,
  backups: BackupManager,
): ExecuteResult {
  const result: ExecuteResult = { created: 0, overwritten: 0, unchanged: 0, removed: 0, backedUp: 0 };

  for (const w of plan.writes) {
    if (w.changeType === 'unchanged') {
      // No disk mutation, but still record provenance so revert/reconcile know it.
      manifest.record(w.targetId, w.path, w.hash);
      result.unchanged += 1;
      continue;
    }

    if (w.backupNeeded) {
      const abs = fsGate.assertContained(w.path);
      backups.backup(abs);
      result.backedUp += 1;
    }

    fsGate.writeFile(w.path, w.content);
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

/** Normalize a plan path to the manifest's project-relative POSIX form. */
export function relOf(fsGate: GuardedFs, p: string): string {
  return toRelPosix(fsGate.root, path.resolve(fsGate.root, p));
}
