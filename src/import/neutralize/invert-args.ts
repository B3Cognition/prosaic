import { DEFAULT_PLACEHOLDERS } from '../../pipeline/stages/stage3-args';
import { Warning } from '../../domain/warnings';

/** The canonical neutral placeholder used when inverting argument tokens (FR-059). */
export const CANONICAL_NEUTRAL_PLACEHOLDER = '{{args}}';

export interface InvertArgsResult {
  body: string;
  warnings: Warning[];
  defaultedChoices: string[];
}

/**
 * Convert each target argument token in the body back to the canonical neutral
 * placeholder (FR-017, FR-059, FR-060, FR-084).
 *
 * A body that had `$ARGUMENTS` → receives `{{args}}` (1 canonical neutral placeholder).
 * When the token maps back to 2+ possible neutrals, records the choice (FR-060).
 * Leaves 0 target-specific argument tokens in the neutral body (FR-084).
 */
export function invertArgs(
  body: string,
  argumentToken: string,
  foreignPath: string,
): InvertArgsResult {
  const warnings: Warning[] = [];
  const defaultedChoices: string[] = [];

  if (!argumentToken || !body.includes(argumentToken)) {
    return { body, warnings, defaultedChoices };
  }

  const newBody = body.split(argumentToken).join(CANONICAL_NEUTRAL_PLACEHOLDER);

  // Record the placeholder choice if the token was one of the known placeholders
  // (meaning it's already a neutral placeholder rephrased to a target token)
  const isKnownToken = DEFAULT_PLACEHOLDERS.includes(argumentToken);
  if (!isKnownToken) {
    const choice = `placeholder:${argumentToken} → ${CANONICAL_NEUTRAL_PLACEHOLDER}`;
    defaultedChoices.push(choice);
    warnings.push({
      kind: 'defaulted-choice',
      artifact: foreignPath,
      message:
        `Argument token "${argumentToken}" converted to canonical neutral placeholder ` +
        `"${CANONICAL_NEUTRAL_PLACEHOLDER}". If a different placeholder was intended, ` +
        `edit the neutral body directly.`,
    });
  }

  return { body: newBody, warnings, defaultedChoices };
}
