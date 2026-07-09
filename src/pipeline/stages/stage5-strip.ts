import { Stage } from '../stage';
import { PipelineState } from '../state';
import { NEUTRAL_KEYS } from '../../registry/descriptor';

/** Neutral authoring-only keys removed from every emitted artifact (FR-042). */
export const NEUTRAL_STRIP_KEYS = [...NEUTRAL_KEYS, 'overrides', 'type'] as const;

/**
 * Stage 5 — neutral-behavior strip (FR-042). Remove 100% of neutral behavior
 * keys (and the authoring-only `overrides`/`type` keys) so zero neutral keys
 * appear in any emitted file. Concrete keys produced by Stage 4 remain because
 * they are emitted under their translated names, not the neutral names.
 */
export const stage5Strip: Stage = {
  index: 5,
  name: 'neutral-strip',
  run(state: PipelineState): void {
    for (const key of NEUTRAL_STRIP_KEYS) {
      delete state.frontmatter[key];
    }
  },
};
