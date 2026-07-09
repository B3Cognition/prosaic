/** The four artifact types Prosaic classifies (FR-001). */
export type ArtifactType = 'rule' | 'skill' | 'subagent' | 'command';

export const ARTIFACT_TYPES: readonly ArtifactType[] = ['rule', 'skill', 'subagent', 'command'];

/** The three deployment types an artifact can route to (FR-048). */
export type DeploymentType = 'command' | 'skill' | 'agent';

export const DEPLOYMENT_TYPES: readonly DeploymentType[] = ['command', 'skill', 'agent'];

/** A frontmatter map: string keys to arbitrary YAML-representable values. */
export type Frontmatter = Record<string, unknown>;

/** A resource file that travels inside a skill/subagent bundle. */
export interface ResourceFile {
  /** Path of the resource relative to the bundle root. */
  relPath: string;
  content: string;
}

/**
 * A discovered, parsed, classified, validated prose artifact — the unit that
 * flows through the transformation pipeline (Key Entity: Prose Artifact).
 */
export interface Artifact {
  /** Stable provenance identifier (source-relative path, POSIX). */
  id: string;
  type: ArtifactType;
  frontmatter: Frontmatter;
  body: string;
  /** Source-relative path of the primary artifact file (POSIX). */
  sourcePath: string;
  /** Bundle root for skills/subagents, else undefined. */
  bundleRoot?: string;
  /** Companion resources for a bundle (skills/subagents). */
  resources?: ResourceFile[];
}
