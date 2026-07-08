import { Stage } from '../stage';
import { PipelineState } from '../state';
import { slotFor } from '../../registry/descriptor';
import { computeName } from '../naming';

/**
 * Stage 2 — name rewrite (FR-013). Compute exactly one on-disk base name per
 * target from the target's naming rule; the deployment slot may refine the rule
 * (a slot can override casing/prefix), so naming can depend on the Stage-0 type.
 */
export const stage2Name: Stage = {
  index: 2,
  name: 'name-rewrite',
  run(state: PipelineState): void {
    const slot = slotFor(state.descriptor, state.deploymentType);
    const rule = { ...state.descriptor.naming, ...(slot.naming ?? {}) };
    state.baseName = computeName(state.artifact, rule);
  },
};
