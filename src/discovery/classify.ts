import { ArtifactType, ARTIFACT_TYPES, Frontmatter } from '../domain/types';

export type ClassifyResult =
  | { ok: true; type: ArtifactType }
  | { ok: false; reason: string };

/**
 * Map a top-level source directory to the artifact type it implies. This is the
 * directory-convention signal; the frontmatter `type` key is the explicit signal.
 */
const DIR_CONVENTION: Record<string, ArtifactType> = {
  rules: 'rule',
  rule: 'rule',
  skills: 'skill',
  skill: 'skill',
  subagents: 'subagent',
  subagent: 'subagent',
  agents: 'subagent',
  agent: 'subagent',
  commands: 'command',
  command: 'command',
};

function isArtifactType(v: unknown): v is ArtifactType {
  return typeof v === 'string' && (ARTIFACT_TYPES as readonly string[]).includes(v);
}

/**
 * Classify a parsed artifact into exactly one of the four types (FR-001) using
 * two signals: an explicit frontmatter `type` and the top-level source directory.
 * When both are present and agree, or only one is present, that type wins. When
 * they disagree (>1 type) or neither is present (0 types), the artifact is
 * excluded with a reason (FR-052).
 */
export function classify(sourceRelPath: string, frontmatter: Frontmatter): ClassifyResult {
  const candidates = new Set<ArtifactType>();

  const fmType = frontmatter['type'];
  if (fmType !== undefined) {
    if (!isArtifactType(fmType)) {
      return {
        ok: false,
        reason: `frontmatter type "${String(fmType)}" is not one of rule|skill|subagent|command`,
      };
    }
    candidates.add(fmType);
  }

  const topDir = sourceRelPath.split('/')[0];
  const dirType = DIR_CONVENTION[topDir?.toLowerCase()];
  if (dirType) candidates.add(dirType);

  if (candidates.size === 0) {
    return {
      ok: false,
      reason: `matches 0 artifact types (no frontmatter "type" and directory "${topDir}" is not a known artifact folder)`,
    };
  }
  if (candidates.size > 1) {
    return {
      ok: false,
      reason: `matches more than 1 artifact type: ${[...candidates].sort().join(', ')}`,
    };
  }
  return { ok: true, type: [...candidates][0] };
}
