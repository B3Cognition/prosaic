/**
 * Injected theme seam (T-013, INFRA; consumed by severity/color/layout phases).
 *
 * A `Theme` maps each output state to a wrapper that paints it. The two themes
 * are the correctness firewall protecting every contractual token:
 *
 * - `plainTheme` wrappers are the exact identity — they add zero bytes, so plain
 *   output is byte-identical to the pre-enhancement output and holds zero escape
 *   sequences (FR-002, NFR-003, NFR-005).
 * - `styledTheme` wrappers only *prepend* an opening SGR and *append* a reset;
 *   they never alter the inner string, so `stripAnsi(wrapper(s)) === s` for every
 *   wrapper (this substring invariance is what keeps every token verbatim).
 *
 * Each outcome-state wrapper uses a distinct SGR color code (green/yellow/red/
 * gray) and `path` uses a non-color style (underline) disjoint from every
 * outcome color (FR-006, FR-022, FR-023, FR-024, FR-025).
 *
 * The theme also carries the non-color status markers (FR-007, NFR-004) and the
 * ASCII-vs-glyph choice for constrained terminals (FR-008, NFR-007): plain
 * markers are pure ASCII so the plain path holds zero non-ASCII bytes, while the
 * styled markers may use Unicode glyphs an interactive UTF terminal can render.
 */

import { green, yellow, red, gray, dim, underline } from './style';
import { PresentationMode } from './presentation';

export type Wrapper = (s: string) => string;

export interface Theme {
  /** created / success state (unique color). */
  created: Wrapper;
  /** warning / overwrite state (unique color). */
  overwrite: Wrapper;
  /** error / dropped state (unique color). */
  error: Wrapper;
  /** unchanged / no-op state (unique color). */
  unchanged: Wrapper;
  /** filesystem path (unique non-color style). */
  path: Wrapper;
  /** the `warning` severity token. */
  warn: Wrapper;
  /** the `error:` severity token. */
  errorPrefix: Wrapper;
  /** de-emphasized text (e.g. remediation lines). */
  dim: Wrapper;
  /** non-color marker for a created/ok outcome (pure ASCII in plain mode). */
  okMarker: string;
  /** non-color marker for a dropped/failed outcome (pure ASCII in plain mode). */
  dropMarker: string;
  /** the "from → to" arrow (pure ASCII in plain mode). */
  arrow: string;
}

const identity: Wrapper = (s) => s;

/** Plain, escape-free, ASCII-only theme — the default and the plain path. */
export const plainTheme: Theme = {
  created: identity,
  overwrite: identity,
  error: identity,
  unchanged: identity,
  path: identity,
  warn: identity,
  errorPrefix: identity,
  dim: identity,
  okMarker: '[ok]',
  dropMarker: '[drop]',
  arrow: '->',
};

/** Styled theme — one unique SGR color per outcome state, glyph markers. */
export const styledTheme: Theme = {
  created: green,
  overwrite: yellow,
  error: red,
  unchanged: gray,
  path: underline,
  warn: yellow,
  errorPrefix: red,
  dim,
  okMarker: '✓', // ✓
  dropMarker: '✗', // ✗
  arrow: '→', // →
};

/** Return the theme for a resolved presentation mode. */
export function themeFor(mode: PresentationMode): Theme {
  return mode === 'styled' ? styledTheme : plainTheme;
}
