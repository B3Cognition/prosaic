import { Artifact } from '../domain/types';
import { TargetDescriptor, NeutralKey } from '../registry/descriptor';
import { resolveDeploymentType } from '../pipeline/stages/stage0-resolve';
import { translateNeutral } from '../vocabulary/translator';
import { applyOverrides } from '../vocabulary/override';
import { ResolvedExecutionData, ResolvedField } from './types';

/** Neutral key each resolved-execution field is sourced from (ADR-005). */
const FIELD_NEUTRAL_KEY: Record<'model' | 'reasoningEffort' | 'tools', NeutralKey> = {
  model: 'capability',
  reasoningEffort: 'effort',
  tools: 'tools',
};

function resolveField(
  field: 'model' | 'reasoningEffort' | 'tools',
  dropped: NeutralKey[],
  concrete: Record<string, unknown>,
  descriptor: TargetDescriptor,
): ResolvedField<unknown> {
  const neutralKey = FIELD_NEUTRAL_KEY[field];
  if (dropped.includes(neutralKey)) {
    return { status: 'unresolved' };
  }
  const rule = descriptor.translations?.[neutralKey];
  const toKey = rule?.toKey;
  if (!toKey || !(toKey in concrete)) {
    return { status: 'unresolved' };
  }
  return { status: 'resolved', value: concrete[toKey] };
}

/**
 * Compute the resolved execution data for one artifact-target pair, using the
 * same translation logic that produces presentation files (FR-003, ADR-001).
 * Pure: no I/O, always succeeds.
 */
export function resolveExecution(
  artifact: Artifact,
  descriptor: TargetDescriptor,
): ResolvedExecutionData {
  const { concrete, dropped } = translateNeutral(artifact.frontmatter, descriptor);
  const overridden = applyOverrides(concrete, artifact.frontmatter, descriptor);

  return {
    artifactId: artifact.id,
    targetId: descriptor.id,
    model: resolveField('model', dropped, overridden, descriptor),
    reasoningEffort: resolveField('reasoningEffort', dropped, overridden, descriptor),
    tools: resolveField('tools', dropped, overridden, descriptor),
    executionType: { status: 'resolved', value: resolveDeploymentType(artifact) },
  };
}
