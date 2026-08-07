/**
 * The single source of truth for the ANSI escape regex (T-001).
 *
 * "ANSI SGR sequence" per the spec is `ESC[<params>m`. Keeping the regex in one
 * module means every escape-count assertion across the suite measures the same
 * thing. All helpers below derive from this one pattern.
 */

/** Matches one SGR sequence: ESC `[` params `m`. Global so it counts every hit. */
export const ANSI_SGR = new RegExp(String.raw`\x1b\[[0-9;]*m`, 'g');

/** Remove every ANSI SGR sequence, leaving the underlying text intact. */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_SGR, '');
}

/** Count ANSI escape sequences (this CLI only emits SGR sequences). */
export function countEscapes(s: string): number {
  return s.match(ANSI_SGR)?.length ?? 0;
}

/** Count ANSI SGR sequences — an alias for {@link countEscapes} for readability. */
export function countSGR(s: string): number {
  return countEscapes(s);
}

/** True when `s` holds zero bytes above the 7-bit ASCII range. */
export function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

/** Count the code units above the 7-bit ASCII range. */
export function countNonAscii(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) n++;
  }
  return n;
}
