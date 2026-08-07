import { RunPlan, planSummary } from './plan';
import { Theme, plainTheme } from '../cli/theme';

/**
 * Render a plan as preview lines without mutating disk (FR-037, FR-038, FR-063).
 * Every create, overwrite, backup, and reconcile-removal is reported; reconcile
 * removals are labeled as removals (AC-030). The same RunPlan drives execution,
 * so the preview cannot drift from what apply/revert would do.
 *
 * Each change renders its state color and its path style through the injected
 * theme (T-017): the ASCII state label is the non-color signal that keeps every
 * state identifiable when color is removed (FR-007, NFR-004), and the theme
 * defaults to plain so plain output stays byte-identical and escape-free.
 */
export function previewPlan(plan: RunPlan, mode: 'apply' | 'revert', theme: Theme = plainTheme): string[] {
  const lines: string[] = [];

  for (const w of plan.writes) {
    if (w.changeType === 'unchanged') continue;
    const backup = w.backupNeeded ? ' (backup prior content)' : '';
    lines.push(`${label(w.changeType, theme)} ${theme.path(w.path)} [${w.targetId}]${backup}`);
  }

  for (const r of plan.removals) {
    lines.push(`${theme.error('remove ')} ${theme.path(r.path)} [${r.targetId}]`);
  }

  const s = planSummary(plan);
  const header =
    mode === 'apply'
      ? `Dry run (apply): ${s.create} create, ${s.overwrite} overwrite, ${s.backup} backup, ${s.remove} remove, ${s.unchanged} unchanged. 0 files written, 0 files deleted.`
      : `Dry run (revert): ${s.remove} remove. 0 files deleted.`;

  return [header, ...lines];
}

function label(changeType: 'create' | 'overwrite' | 'unchanged', theme: Theme): string {
  switch (changeType) {
    case 'create':
      return theme.created('create ');
    case 'overwrite':
      return theme.overwrite('update ');
    default:
      return theme.unchanged('noop   ');
  }
}
