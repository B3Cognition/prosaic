import { Stage } from '../stage';
import { PipelineState } from '../state';
import { renderMarkdown } from '../../render/markdown';
import { renderTomlFile } from '../../render/toml';
import { renderYamlFile } from '../../render/yaml';

/** Default field the Markdown body maps into for structured formats. */
const DEFAULT_BODY_FIELD = 'prompt';

/**
 * Stage 7 — format conversion (FR-020). Serialize the transformed frontmatter
 * and body into the target's required format. Structured formats (TOML, YAML)
 * map the body into `bodyField`; Markdown emits a frontmatter block plus body.
 * Output is deterministic for byte-identical repeated renders (FR-021, NFR-009).
 */
export const stage7Format: Stage = {
  index: 7,
  name: 'format-conversion',
  run(state: PipelineState): void {
    const bodyField = state.descriptor.bodyField ?? DEFAULT_BODY_FIELD;
    switch (state.format) {
      case 'markdown':
        state.serialized = renderMarkdown(state.frontmatter, state.body);
        break;
      case 'toml':
        state.serialized = renderTomlFile(state.frontmatter, state.body, bodyField);
        break;
      case 'yaml':
        state.serialized = renderYamlFile(state.frontmatter, state.body, bodyField);
        break;
    }
  },
};
