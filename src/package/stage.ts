import * as path from 'path';
import { GuardedFs } from '../write/guarded-fs';
import { RunPlan } from '../lifecycle/plan';

/** Transient package-staging root, excluded from discovery (T-004). */
export const PACKAGE_STAGING_ROOT = '.prosaic-package-staging';

/** The per-package staging subdirectory, named after its package id. */
export function stagingDirFor(packageId: string): string {
  return path.posix.join(PACKAGE_STAGING_ROOT, packageId);
}

/** The staged copy's path for a given final destination path. */
export function stagingPathFor(packageId: string, destPath: string): string {
  return path.posix.join(stagingDirFor(packageId), destPath);
}

/**
 * Stage every non-unchanged planned write's full content under this package's
 * own staging subdirectory (ADR-007). The subdirectory is cleared at the
 * **start** of this stage so a leftover partial tree from a prior interrupted
 * run is never later committed by accident. The destination is never touched
 * here — a crash during this (dominant) phase leaves the destination 100%
 * pre-deployment (FR-018, FR-042).
 */
export function stagePackageWrites(plan: RunPlan, fsGate: GuardedFs, packageId: string): void {
  const stagingDir = stagingDirFor(packageId);
  fsGate.removeDir(stagingDir);

  for (const w of plan.writes) {
    if (w.changeType === 'unchanged') continue;
    fsGate.writeFileAtomic(stagingPathFor(packageId, w.path), w.content);
  }
}
