import { Warning } from '../domain/warnings';
import { Theme, plainTheme } from '../cli/theme';

/**
 * Format one warning line in the structured severity form (T-015, FR-010):
 *
 *   warning[<kind>] <artifact> <arrow> <target>: <message>
 *
 * The leading `warning` token is colored (yellow) only when the stream theme is
 * styled; under the plain theme it is the exact identity, so 100% of warning
 * lines begin with the literal token `warning`. The `<artifact> <arrow> <target>`
 * segment is omitted when neither artifact nor target is present. The arrow comes
 * from the theme so the plain path stays pure ASCII (NFR-007).
 */
export function formatWarningLine(w: Warning, theme: Theme = plainTheme): string {
  const where = [w.artifact, w.target].filter(Boolean).join(` ${theme.arrow} `);
  const head = `${theme.warn('warning')}[${w.kind}]`;
  return where ? `${head} ${where}: ${w.message}` : `${head} ${w.message}`;
}

/**
 * Surface every skipped or lossy transformation as a reported warning naming the
 * artifact and target, so a run has 0 silent skips and 0 silent capability
 * losses (NFR-006). This is a pure formatter over the collected warnings; the
 * planner is responsible for emitting one warning per skip/loss. The optional
 * theme colors the severity token on a styled stream while leaving plain output
 * byte-for-byte stable.
 */
export function surfaceWarnings(warnings: Warning[], theme: Theme = plainTheme): string[] {
  return warnings.map((w) => formatWarningLine(w, theme));
}

/** Count warnings representing a skipped or lossy transformation (NFR-006). */
export function skipOrLossCount(warnings: Warning[]): number {
  return warnings.filter((w) => w.kind === 'unsupported-pair' || w.kind === 'lossy-intent').length;
}
