import * as fs from 'fs';
import * as path from 'path';
import { ResourceFile } from '../../domain/types';
import { Warning } from '../../domain/warnings';

export interface BundleGroup {
  primaryAbs: string;
  resources: ResourceFile[];
  warnings: Warning[];
}

/**
 * Recognize multi-file skill/subagent bundles and re-associate resource files
 * with their primary artifact (FR-041, FR-073, FR-074, FR-075).
 *
 * A bundle is a directory containing a primary Markdown/TOML/YAML file plus
 * one or more resource files. Resource files are re-associated with the primary
 * and intra-bundle references are rewritten to resolve after source write.
 */
export function reassociateBundle(
  primaryAbsPath: string,
  slotDir: string,
  projectRoot: string,
  foreignPath: string,
): BundleGroup {
  const primaryDir = path.dirname(primaryAbsPath);
  const warnings: Warning[] = [];
  const resources: ResourceFile[] = [];

  // If the primary file is directly in the slot dir, it's not a bundle root
  if (primaryDir === slotDir) {
    return { primaryAbs: primaryAbsPath, resources, warnings };
  }

  // The primary file is in a subdirectory of the slot → bundle root is primaryDir
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(primaryDir, { withFileTypes: true });
  } catch {
    return { primaryAbs: primaryAbsPath, resources, warnings };
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = path.join(primaryDir, entry.name);
    if (abs === primaryAbsPath) continue;

    let content: string;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      warnings.push({
        kind: 'unresolved-reference',
        artifact: foreignPath,
        message: `Bundle resource "${entry.name}" could not be read: ${(e as Error).message}`,
      });
      continue;
    }

    resources.push({ relPath: entry.name, content });
  }

  // Rewrite intra-bundle references in resource files (FR-074)
  const resourceNames = new Set(resources.map((r) => r.relPath));
  const rewrittenResources: ResourceFile[] = [];

  for (const resource of resources) {
    const { content: rewritten, unresolvedRefs } = rewriteIntraBundleRefs(
      resource.content,
      resourceNames,
      foreignPath,
    );
    for (const ref of unresolvedRefs) {
      warnings.push({
        kind: 'unresolved-reference',
        artifact: foreignPath,
        message: `Intra-bundle reference "${ref}" in resource "${resource.relPath}" cannot be resolved to a bundle resource.`,
      });
    }
    rewrittenResources.push({ relPath: resource.relPath, content: rewritten });
  }

  return { primaryAbs: primaryAbsPath, resources: rewrittenResources, warnings };
}

function rewriteIntraBundleRefs(
  content: string,
  bundleResources: Set<string>,
  foreignPath: string,
): { content: string; unresolvedRefs: string[] } {
  const unresolvedRefs: string[] = [];
  // Find Markdown links/images that reference local files
  const rewritten = content.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, href) => {
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) {
      return match;
    }
    const basename = path.posix.basename(href);
    if (bundleResources.has(basename)) {
      // Reference resolves to a bundle resource — keep as-is (will resolve after write)
      return match;
    }
    if (!href.startsWith('http') && !path.isAbsolute(href)) {
      unresolvedRefs.push(href);
    }
    return match;
  });
  return { content: rewritten, unresolvedRefs };
}
