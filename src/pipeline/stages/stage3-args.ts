import { Stage } from '../stage';
import { PipelineState } from '../state';

/**
 * Default argument placeholder tokens recognized in command bodies. The neutral
 * authoring form uses `{{args}}` / `$ARGUMENTS`; each is rewritten to the
 * target's own argument token (FR-014).
 */
export const DEFAULT_PLACEHOLDERS = ['{{args}}', '{{ args }}', '$ARGUMENTS', '{{ARGS}}'];

/**
 * Stage 3 — argument-placeholder rewrite (FR-014). Every argument placeholder in
 * a command artifact is rewritten to the target's argument token. Non-command
 * artifacts carry no argument placeholders, so this is a no-op for them.
 */
export const stage3Args: Stage = {
  index: 3,
  name: 'argument-rewrite',
  run(state: PipelineState): void {
    if (state.artifact.type !== 'command' && state.deploymentType !== 'command') return;

    const placeholders = state.descriptor.argumentPlaceholders ?? DEFAULT_PLACEHOLDERS;
    const token = state.descriptor.argumentToken;
    let body = state.body;
    for (const ph of placeholders) {
      body = body.split(ph).join(token);
    }
    state.body = body;
  },
};
