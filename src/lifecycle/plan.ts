import { Warning } from '../domain/warnings';

/** A single planned file write (primary, companion, or bundle resource). */
export interface PlannedWrite {
  targetId: string;
  /** Project-relative POSIX path. */
  path: string;
  /** Rendered text for a render-target write; raw bytes for a package deployment write. */
  content: string | Buffer;
  hash: string;
  changeType: 'create' | 'overwrite' | 'unchanged';
  /** True when a content-changing overwrite of a managed file needs a backup (FR-025). */
  backupNeeded: boolean;
  /**
   * Source POSIX mode bits to apply after commit (FR-013, Should-Have,
   * package deployment's Package Runtime Tree only); absent for every
   * render-target write and for Neutral Artifact Tree writes.
   */
  mode?: number;
}

/** A single planned removal (reconcile orphan or revert). */
export interface PlannedRemoval {
  targetId: string;
  path: string;
}

/** The complete plan of a run: writes, removals, and warnings (ADR-010). */
export interface RunPlan {
  writes: PlannedWrite[];
  removals: PlannedRemoval[];
  warnings: Warning[];
}

/** Counts for reporting a plan. */
export function planSummary(plan: RunPlan): {
  create: number;
  overwrite: number;
  unchanged: number;
  backup: number;
  remove: number;
} {
  return {
    create: plan.writes.filter((w) => w.changeType === 'create').length,
    overwrite: plan.writes.filter((w) => w.changeType === 'overwrite').length,
    unchanged: plan.writes.filter((w) => w.changeType === 'unchanged').length,
    backup: plan.writes.filter((w) => w.backupNeeded).length,
    remove: plan.removals.length,
  };
}

/** True when the plan changes nothing on disk (idempotent no-op, NFR-001). */
export function isNoOp(plan: RunPlan): boolean {
  return (
    plan.removals.length === 0 &&
    plan.writes.every((w) => w.changeType === 'unchanged')
  );
}
