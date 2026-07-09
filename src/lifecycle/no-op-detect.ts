import { RunPlan } from './plan';

/**
 * Count the files a plan would actually change on disk. A no-op re-apply over
 * unchanged inputs yields 0 changed files (NFR-001, AC-004).
 */
export function changedFileCount(plan: RunPlan): number {
  const changedWrites = plan.writes.filter((w) => w.changeType !== 'unchanged').length;
  return changedWrites + plan.removals.length;
}

/** True when the plan reports zero changed files (idempotent no-op). */
export function isIdempotentNoOp(plan: RunPlan): boolean {
  return changedFileCount(plan) === 0;
}
