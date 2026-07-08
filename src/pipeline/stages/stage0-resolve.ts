import { Artifact, ArtifactType, DeploymentType } from '../../domain/types';

/**
 * Total mapping from artifact type to deployment type, used when an artifact
 * declares no execution intent (FR-048). Command/skill map straight through;
 * subagent and rule are both agent-shaping artifacts and deploy on the agent
 * lane. Routing (Stage 8) additionally keeps rules in the target's rule slot.
 */
export const ARTIFACT_TO_DEPLOYMENT: Record<ArtifactType, DeploymentType> = {
  command: 'command',
  skill: 'skill',
  subagent: 'agent',
  rule: 'agent',
};

/** Valid neutral execution intents map identically to deployment types. */
const EXECUTION_TO_DEPLOYMENT: Record<string, DeploymentType> = {
  command: 'command',
  skill: 'skill',
  agent: 'agent',
};

/**
 * Stage 0 — resolve exactly one deployment type (FR-048). The declared neutral
 * `execution` intent wins when present and valid; otherwise the deployment type
 * is taken from the artifact type. Runs before name rewrite and routing so both
 * consume a resolved type (resolves ISS-002).
 */
export function resolveDeploymentType(artifact: Artifact): DeploymentType {
  const execution = artifact.frontmatter['execution'];
  if (typeof execution === 'string' && execution in EXECUTION_TO_DEPLOYMENT) {
    return EXECUTION_TO_DEPLOYMENT[execution];
  }
  return ARTIFACT_TO_DEPLOYMENT[artifact.type];
}
