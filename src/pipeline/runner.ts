import { Artifact } from '../domain/types';
import { TargetDescriptor } from '../registry/descriptor';
import { Stage } from './stage';
import { PipelineState, RenderedOutput, initialState } from './state';
import { resolveDeploymentType } from './stages/stage0-resolve';
import { stage1Path } from './stages/stage1-path';
import { stage2Name } from './stages/stage2-name';
import { stage3Args } from './stages/stage3-args';
import { stage4Translate } from './stages/stage4-translate';
import { stage5Strip } from './stages/stage5-strip';
import { stage6Frontmatter } from './stages/stage6-frontmatter';
import { stage7Format } from './stages/stage7-format';
import { stage8Route } from './stages/stage8-route';
import { buildCompanions } from '../render/companions';

/**
 * The fixed sequence of eight ordered stages (FR-011). This array is the single
 * source of order; the runner applies each element exactly once, never
 * reordering or skipping (FR-059).
 */
export const PIPELINE_STAGES: readonly Stage[] = [
  stage1Path,
  stage2Name,
  stage3Args,
  stage4Translate,
  stage5Strip,
  stage6Frontmatter,
  stage7Format,
  stage8Route,
];

export interface RunOptions {
  lossyPolicy?: 'warn' | 'error';
  /** Optional observer recording the order stages ran (for order-and-once tests). */
  trace?: string[];
}

/**
 * Execute the transformation pipeline for one artifact-target pair: Stage-0
 * deployment resolution (FR-048) then the fixed eight stages, each applied
 * exactly once in order (FR-011, FR-059). Produces one fully transformed,
 * serialized output plus any companion files (FR-022, FR-062).
 */
export function runPipeline(
  artifact: Artifact,
  descriptor: TargetDescriptor,
  options: RunOptions = {},
): RenderedOutput {
  const deploymentType = resolveDeploymentType(artifact);
  const state: PipelineState = initialState(
    artifact,
    descriptor,
    deploymentType,
    options.lossyPolicy ?? 'warn',
  );

  for (const stage of PIPELINE_STAGES) {
    stage.run(state);
    options.trace?.push(stage.name);
  }

  if (state.serialized === undefined || state.outputPath === undefined) {
    throw new Error(`Pipeline produced no output for ${artifact.id} → ${descriptor.id}`);
  }

  const dir = state.outputPath.split('/').slice(0, -1).join('/');
  const resources = state.resources.map((r) => ({
    path: dir === '' ? r.relPath : `${dir}/${r.relPath}`,
    content: r.content,
  }));

  return {
    targetId: descriptor.id,
    path: state.outputPath,
    content: state.serialized,
    companions: buildCompanions(state),
    resources,
    warnings: state.warnings,
  };
}
