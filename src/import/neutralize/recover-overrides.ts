import { Frontmatter } from '../../domain/types';
import { Warning } from '../../domain/warnings';

export interface RecoverOverridesResult {
  overrides: Record<string, unknown>;
  warnings: Warning[];
}

/**
 * Recover every concrete key with no neutral origin into the per-target overrides
 * section, keyed by the source target identifier (FR-013, FR-055, FR-056, FR-065).
 * Preserves key names and values with 0 alterations (FR-056). Emits 1 warning per
 * unknown key (FR-028). Drops 0 unknown keys (FR-065).
 */
export function recoverOverrides(
  remaining: Frontmatter,
  targetId: string,
  foreignPath: string,
): RecoverOverridesResult {
  const overrides: Record<string, unknown> = {};
  const warnings: Warning[] = [];

  for (const [key, value] of Object.entries(remaining)) {
    overrides[key] = value;
    warnings.push({
      kind: 'override-recovered',
      artifact: foreignPath,
      target: targetId,
      message:
        `Key "${key}" has no neutral origin in target "${targetId}". ` +
        `Preserved under overrides.${targetId} with value ${JSON.stringify(value)}.`,
    });
  }

  return { overrides, warnings };
}
