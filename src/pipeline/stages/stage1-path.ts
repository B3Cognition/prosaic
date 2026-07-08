import { Stage } from '../stage';
import { PipelineState } from '../state';
import { rewriteReferences } from '../bundle';

/**
 * Stage 1 — bundle-aware path rewrite (FR-012, FR-017). Rewrites every
 * intra-artifact and intra-bundle path reference so references resolve after
 * install, and warns on references to absent resources (AC-013). Skills and
 * subagents receive the same treatment as commands (FR-017).
 */
export const stage1Path: Stage = {
  index: 1,
  name: 'path-rewrite',
  run(state: PipelineState): void {
    const { artifact, descriptor } = state;

    const bodyRewrite = rewriteReferences(state.body, state.resources, artifact.id, descriptor.id);
    state.body = bodyRewrite.text;
    state.warnings.push(...bodyRewrite.warnings);

    state.resources = state.resources.map((r) => {
      const rr = rewriteReferences(r.content, state.resources, artifact.id, descriptor.id);
      state.warnings.push(...rr.warnings);
      return { ...r, content: rr.text };
    });
  },
};
