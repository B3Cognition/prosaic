import { RunPlan, planSummary } from './plan';

/**
 * Render a plan as preview lines without mutating disk (FR-037, FR-038, FR-063).
 * Every create, overwrite, backup, and reconcile-removal is reported; reconcile
 * removals are labeled as removals (AC-030). The same RunPlan drives execution,
 * so the preview cannot drift from what apply/revert would do.
 */
export function previewPlan(plan: RunPlan, mode: 'apply' | 'revert'): string[] {
  const lines: string[] = [];

  for (const w of plan.writes) {
    if (w.changeType === 'unchanged') continue;
    const backup = w.backupNeeded ? ' (backup prior content)' : '';
    lines.push(`${label(w.changeType)} ${w.path} [${w.targetId}]${backup}`);
  }

  for (const r of plan.removals) {
    lines.push(`remove   ${r.path} [${r.targetId}]`);
  }

  const s = planSummary(plan);
  const header =
    mode === 'apply'
      ? `Dry run (apply): ${s.create} create, ${s.overwrite} overwrite, ${s.backup} backup, ${s.remove} remove, ${s.unchanged} unchanged. 0 files written, 0 files deleted.`
      : `Dry run (revert): ${s.remove} remove. 0 files deleted.`;

  return [header, ...lines];
}

function label(changeType: 'create' | 'overwrite' | 'unchanged'): string {
  switch (changeType) {
    case 'create':
      return 'create ';
    case 'overwrite':
      return 'update ';
    default:
      return 'noop   ';
  }
}
