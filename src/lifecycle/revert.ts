import { GuardedFs } from '../write/guarded-fs';
import { Manifest } from '../manifest/manifest';
import { RunPlan, PlannedRemoval } from './plan';

/**
 * Plan a revert: remove only the tool-generated files the manifest records
 * (FR-034, FR-035). When a target selection is given, only that target's
 * recorded files are planned, leaving any sibling target's files in a shared
 * directory intact (FR-036). A file is never planned for deletion unless the
 * manifest records it (FR-035).
 */
export function planRevert(manifest: Manifest, selection: 'all' | string[]): RunPlan {
  const targetFilter =
    selection === 'all' ? null : new Set(selection);

  const removals: PlannedRemoval[] = [];
  for (const entry of manifest.all()) {
    if (targetFilter && !targetFilter.has(entry.target)) continue;
    removals.push({ targetId: entry.target, path: entry.path });
  }
  return { writes: [], removals, warnings: [] };
}

/**
 * Execute a revert plan: delete each recorded file through the guarded
 * filesystem and drop its manifest record, then save the manifest atomically.
 * Only manifest-recorded files are ever deleted (FR-035).
 */
export function executeRevert(plan: RunPlan, fsGate: GuardedFs, manifest: Manifest): number {
  for (const r of plan.removals) {
    fsGate.deleteFile(r.path);
    manifest.remove(r.targetId, r.path);
  }
  manifest.save();
  return plan.removals.length;
}
