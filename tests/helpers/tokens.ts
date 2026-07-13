/**
 * Frozen corpus of contractual tokens (T-001, Contractual Token entity).
 *
 * These are the correctness-bearing strings that must survive verbatim across
 * every presentation mode (required tokens, fidelity labels) or must never appear
 * (prohibited phrases). Freezing them keeps every downstream assertion measuring
 * the same corpus.
 */

/** Tokens that MUST appear verbatim in the relevant output (FR-013, FR-027). */
export const REQUIRED_TOKENS: readonly string[] = Object.freeze([
  'auto-detected',
  'lossless-where-invertible',
]);

/** Per-target fidelity labels that must print with zero alterations (FR-028). */
export const FIDELITY_LABELS: readonly string[] = Object.freeze([
  'fully-invertible',
  'invertible-with-overrides',
  'normalized-equivalent',
  'mismatch',
]);

/** Phrases that MUST NOT appear in any presentation mode (FR-014, FR-031). */
export const PROHIBITED_PHRASES: readonly string[] = Object.freeze([
  'nothing is lost',
  '100% lossless',
]);
