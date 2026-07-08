import { Stage } from '../stage';
import { PipelineState } from '../state';
import { translateNeutral } from '../../vocabulary/translator';
import { applyOverrides } from '../../vocabulary/override';
import { lossyWarnings } from '../../vocabulary/lossy';

/**
 * Stage 4 — neutral-behavior translation (FR-015, FR-016, FR-018). Translate
 * every declared neutral key into the target's concrete frontmatter, apply the
 * per-target override escape hatch, and warn on any non-representable intent.
 * Translated entries are merged into the working frontmatter; Stage 5 then
 * removes the neutral keys themselves.
 */
export const stage4Translate: Stage = {
  index: 4,
  name: 'neutral-translate',
  run(state: PipelineState): void {
    const { concrete, dropped } = translateNeutral(state.frontmatter, state.descriptor);
    const withOverrides = applyOverrides(concrete, state.artifact.frontmatter, state.descriptor);

    // Held apart from the working frontmatter so Stage 5's neutral strip cannot
    // remove a translated entry whose concrete key collides with a neutral name.
    Object.assign(state.translated, withOverrides);

    state.warnings.push(
      ...lossyWarnings(dropped, state.artifact.id, state.descriptor.id, state.lossyPolicy),
    );
  },
};
