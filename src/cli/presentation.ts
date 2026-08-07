/**
 * Per-stream presentation resolver (T-011, FR-002..FR-005, FR-020, FR-021, NFR-003).
 *
 * `resolvePresentation` is a pure, total function: no I/O, no throwing. It is
 * called once per output stream (stdout and stderr resolve independently, so a
 * command writing to a piped stdout while stderr is a TTY styles exactly one of
 * them — FR-005). `undefined` `isTTY` (unknown interactivity) resolves to
 * `plain` rather than throwing.
 */

export type PresentationMode = 'styled' | 'plain';

export interface PresentationInput {
  /** Whether this stream is an interactive terminal (`undefined` = unknown). */
  isTTY?: boolean;
  /** The process environment (read for NO_COLOR / FORCE_COLOR conventions). */
  env: NodeJS.ProcessEnv;
  /**
   * Explicit `--color` / `--no-color` flag: `true` forces styled, `false` forces
   * plain, `undefined` means the flag was not supplied.
   */
  colorFlag?: boolean;
}

/**
 * Resolve the presentation mode for a single stream. Precedence, highest first:
 *
 *   1. `--no-color` flag           → plain
 *   2. `--color` flag              → styled
 *   3. `NO_COLOR` present          → plain (regardless of value or interactivity)
 *   4. `FORCE_COLOR` == "0"        → plain
 *   5. `FORCE_COLOR` set otherwise → styled
 *   6. interactive stream          → styled
 *   7. otherwise                   → plain
 *
 * Steps 3 vs 5 resolve the FR-003/FR-004 conflict under FR-021: `NO_COLOR` is
 * checked first, so when both conventions are set, `NO_COLOR` wins.
 */
export function resolvePresentation(input: PresentationInput): PresentationMode {
  const { isTTY, env, colorFlag } = input;

  // 1 & 2: an explicit flag overrides every environment convention.
  if (colorFlag === false) return 'plain';
  if (colorFlag === true) return 'styled';

  // 3: NO_COLOR present (any value, even empty) disables color — and wins over
  // FORCE_COLOR because it is checked first (FR-021).
  if (env.NO_COLOR !== undefined) return 'plain';

  // 4 & 5: FORCE_COLOR value semantics.
  const forceColor = env.FORCE_COLOR;
  if (forceColor !== undefined) {
    return forceColor === '0' ? 'plain' : 'styled';
  }

  // 6 & 7: fall back to stream interactivity; unknown interactivity is plain.
  return isTTY === true ? 'styled' : 'plain';
}
