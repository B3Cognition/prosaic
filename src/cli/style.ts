/**
 * Zero-dependency ANSI SGR helper (T-010, FR-001, NFR-001).
 *
 * Every wrapper emits exactly one opening SGR sequence (`ESC[<code>m`) and one
 * reset (`ESC[0m`) around the given string, and never mutates the wrapped text —
 * so `stripAnsi(wrap(s)) === s` holds for every wrapper. There are deliberately
 * no runtime imports here, so the "zero new runtime dependency" contract
 * (NFR-001) stays green: color is produced by raw escape codes alone.
 *
 * This module never reads the environment and never decides *when* to color;
 * that decision lives in `presentation.ts`, and the mapping of state→color lives
 * in `theme.ts`. `style.ts` only knows how to paint a string a single color.
 */

/** Control Sequence Introducer prefix for an SGR sequence. */
const CSI = '[';
/** The SGR reset sequence closing every wrapper. */
const RESET = `${CSI}0m`;

/** Wrap `s` in exactly one opening SGR code plus the reset, leaving `s` intact. */
export function wrap(code: number, s: string): string {
  return `${CSI}${code}m${s}${RESET}`;
}

export const green = (s: string): string => wrap(32, s);
export const yellow = (s: string): string => wrap(33, s);
export const red = (s: string): string => wrap(31, s);
export const gray = (s: string): string => wrap(90, s);
export const dim = (s: string): string => wrap(2, s);
export const underline = (s: string): string => wrap(4, s);
