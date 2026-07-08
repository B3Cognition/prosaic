import { ArtifactType } from '../domain/types';
import { Warning } from '../domain/warnings';
import { TargetDescriptor, supports } from '../registry/descriptor';

/**
 * Capability gate for an artifact-target pair (FR-039). Returns a skip warning
 * naming the artifact and target when the target does not natively support the
 * artifact type, else null. The caller writes 0 files for a skipped pair.
 */
export function capabilitySkip(
  descriptor: TargetDescriptor,
  artifactId: string,
  type: ArtifactType,
): Warning | null {
  if (supports(descriptor, type)) return null;
  return {
    kind: 'unsupported-pair',
    artifact: artifactId,
    target: descriptor.id,
    message: `target "${descriptor.id}" does not natively support artifact type "${type}"; skipped`,
  };
}
