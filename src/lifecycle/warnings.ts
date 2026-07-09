import { Warning } from '../domain/warnings';

/**
 * Surface every skipped or lossy transformation as a reported warning naming the
 * artifact and target, so a run has 0 silent skips and 0 silent capability
 * losses (NFR-006). This is a pure formatter over the collected warnings; the
 * planner is responsible for emitting one warning per skip/loss.
 */
export function surfaceWarnings(warnings: Warning[]): string[] {
  return warnings.map((w) => {
    const where = [w.artifact, w.target].filter(Boolean).join(' → ');
    return where
      ? `warning[${w.kind}] ${where}: ${w.message}`
      : `warning[${w.kind}] ${w.message}`;
  });
}

/** Count warnings representing a skipped or lossy transformation (NFR-006). */
export function skipOrLossCount(warnings: Warning[]): number {
  return warnings.filter((w) => w.kind === 'unsupported-pair' || w.kind === 'lossy-intent').length;
}
