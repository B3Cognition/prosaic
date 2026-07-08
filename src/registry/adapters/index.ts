import { TargetDescriptor } from '../descriptor';
import { markdownFrontmatterCluster } from './markdown-frontmatter';
import { tomlCommandCluster } from './toml-command';
import { yamlRecipeCluster } from './yaml-recipe';
import { companionFileCluster } from './companion-file';
import { markdownLongtailCluster } from './markdown-longtail';

/**
 * The built-in target descriptor set, aggregated from the per-format clusters
 * (T-044..T-048). Adding a target means adding a descriptor to a cluster — no
 * core transformation code changes (FR-008).
 */
export const ALL_DESCRIPTORS: TargetDescriptor[] = [
  ...markdownFrontmatterCluster,
  ...tomlCommandCluster,
  ...yamlRecipeCluster,
  ...companionFileCluster,
  ...markdownLongtailCluster,
];
