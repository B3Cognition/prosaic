import { Stage } from '../stage';
import { PipelineState } from '../state';
import { Frontmatter } from '../../domain/types';

/**
 * Stage 6 — frontmatter rewrite applying all three rule categories (FR-043):
 * `strip` removes keys, `passthrough` keeps the allowed remainder, `inject` adds
 * target-required keys. Concrete entries produced by neutral translation
 * (Stage 4) are merged in last so a translated key survives even when its name
 * collides with a stripped neutral name.
 */
export const stage6Frontmatter: Stage = {
  index: 6,
  name: 'frontmatter-rewrite',
  run(state: PipelineState): void {
    const rules = state.descriptor.frontmatter;
    const src = state.frontmatter;
    const out: Frontmatter = {};

    // passthrough: "*" keeps every remaining key, else only the listed keys.
    const stripSet = new Set(rules.strip);
    if (rules.passthrough === '*') {
      for (const key of Object.keys(src)) {
        if (!stripSet.has(key)) out[key] = src[key];
      }
    } else {
      for (const key of rules.passthrough) {
        if (key in src && !stripSet.has(key)) out[key] = src[key];
      }
    }

    // inject: target-required keys (override passthrough on conflict).
    for (const [k, v] of Object.entries(rules.inject)) {
      out[k] = v;
    }

    // Translated concrete entries win last (FR-015 target-native frontmatter).
    for (const [k, v] of Object.entries(state.translated)) {
      out[k] = v;
    }

    state.frontmatter = out;
  },
};
