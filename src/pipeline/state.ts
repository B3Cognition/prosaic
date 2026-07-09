import { Artifact, DeploymentType, Frontmatter, ResourceFile } from '../domain/types';
import { Warning } from '../domain/warnings';
import { TargetDescriptor, SerializationFormat } from '../registry/descriptor';

/**
 * Mutable working state threaded through the eight ordered pipeline stages
 * (FR-011). Each stage reads and writes fields on this object exactly once.
 */
export interface PipelineState {
  readonly artifact: Artifact;
  readonly descriptor: TargetDescriptor;
  readonly lossyPolicy: 'warn' | 'error';

  /** Stage 0 output: resolved deployment type (FR-048). */
  deploymentType: DeploymentType;

  /** Working frontmatter (mutated by translation/strip/rewrite). */
  frontmatter: Frontmatter;
  /**
   * Concrete frontmatter produced by neutral translation (Stage 4), held apart
   * from the working frontmatter so the neutral strip (Stage 5) cannot remove a
   * translated entry whose concrete key name collides with a neutral key name.
   * Merged into the emitted frontmatter by the frontmatter rewrite (Stage 6).
   */
  translated: Frontmatter;
  /** Working Markdown body (mutated by argument rewrite). */
  body: string;
  /** Working bundle resources with rewritten paths (Stage 1). */
  resources: ResourceFile[];

  /** Stage 2 output: computed on-disk base name (no extension). */
  baseName: string;

  /** Stage 7 output: serialized primary content. */
  serialized?: string;
  format: SerializationFormat;

  /** Stage 8 output: project-relative output path of the primary file. */
  outputPath?: string;

  warnings: Warning[];
}

/** The finished product of the pipeline for one artifact-target pair. */
export interface RenderedOutput {
  targetId: string;
  /** Project-relative POSIX path of the primary file. */
  path: string;
  content: string;
  /** Companion files written alongside the primary (FR-022). */
  companions: Array<{ path: string; content: string }>;
  /** Relocated bundle resource files, written alongside the primary (FR-012). */
  resources: Array<{ path: string; content: string }>;
  warnings: Warning[];
}

export function initialState(
  artifact: Artifact,
  descriptor: TargetDescriptor,
  deploymentType: DeploymentType,
  lossyPolicy: 'warn' | 'error',
): PipelineState {
  return {
    artifact,
    descriptor,
    lossyPolicy,
    deploymentType,
    frontmatter: { ...artifact.frontmatter },
    translated: {},
    body: artifact.body,
    resources: (artifact.resources ?? []).map((r) => ({ ...r })),
    baseName: '',
    format: descriptor.format,
    warnings: [],
  };
}
