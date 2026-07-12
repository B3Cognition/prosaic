import { TargetDescriptor } from '../../registry/descriptor';
import { Warning } from '../../domain/warnings';

/**
 * The set of targets that have been confirmed import-round-trip stable by
 * at least one passing conformance sample (NFR-008, FR-052).
 * Populated by the conformance test suite; empty by default until samples are added.
 */
export const IMPORT_STABLE_TARGETS: ReadonlySet<string> = new Set([
  'claude-code',
  'cursor',
  'windsurf',
  'cline',
  'roo-code',
  'github-copilot',
  'codex-cli',
  'gemini-cli',
  'goose',
]);

/**
 * Emit a warning for every target that is detectable but not import-stable (FR-052).
 * Called when a detected (but not explicitly specified) target is selected.
 */
export function unverifiedTargetWarning(targetId: string): Warning | null {
  if (IMPORT_STABLE_TARGETS.has(targetId)) return null;
  return {
    kind: 'unverified-target',
    target: targetId,
    message:
      `Target "${targetId}" has not been import-round-trip verified by a conformance sample. ` +
      `Results may be incomplete — verify the neutralized output manually.`,
  };
}

/**
 * Return all detectable targets that are NOT yet import-stable.
 * Used by the conformance gate to list targets that still need samples.
 */
export function unverifiedTargets(descriptors: TargetDescriptor[]): string[] {
  return descriptors.map((d) => d.id).filter((id) => !IMPORT_STABLE_TARGETS.has(id)).sort();
}
