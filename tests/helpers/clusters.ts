import { TargetDescriptor } from '../../src/registry/descriptor';
import { markdownFrontmatterCluster } from '../../src/registry/adapters/markdown-frontmatter';
import { tomlCommandCluster } from '../../src/registry/adapters/toml-command';
import { yamlRecipeCluster } from '../../src/registry/adapters/yaml-recipe';
import { companionFileCluster } from '../../src/registry/adapters/companion-file';
import { markdownLongtailCluster } from '../../src/registry/adapters/markdown-longtail';

/** Cluster name → descriptors, for organizing conformance fixtures per cluster. */
export const CLUSTERS: Record<string, TargetDescriptor[]> = {
  'markdown-frontmatter': markdownFrontmatterCluster,
  'toml-command': tomlCommandCluster,
  'yaml-recipe': yamlRecipeCluster,
  'companion-file': companionFileCluster,
  'markdown-longtail': markdownLongtailCluster,
};

/** Map each target id to its cluster name. */
export function clusterOf(targetId: string): string {
  for (const [name, descs] of Object.entries(CLUSTERS)) {
    if (descs.some((d) => d.id === targetId)) return name;
  }
  return 'unknown';
}
