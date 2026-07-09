import { Artifact } from '../domain/types';
import { NamingRule } from '../registry/descriptor';

/** Split an arbitrary string into lowercase word tokens for recasing. */
function tokenize(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s._\-/]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

function applyCasing(base: string, casing: NamingRule['casing']): string {
  if (casing === 'original') return base;
  const tokens = tokenize(base);
  if (casing === 'kebab') return tokens.join('-');
  if (casing === 'snake') return tokens.join('_');
  return base;
}

/** The raw base name (no extension) from the naming source. */
function rawBase(artifact: Artifact, from: NamingRule['from']): string {
  if (from === 'name') {
    const name = artifact.frontmatter['name'];
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  // filename: bundle dir name for bundles, else the file stem.
  if (artifact.bundleRoot) {
    const parts = artifact.bundleRoot.split('/');
    return parts[parts.length - 1];
  }
  const file = artifact.sourcePath.split('/').pop() ?? artifact.sourcePath;
  return file.replace(/\.md$/i, '');
}

/**
 * Compute exactly one on-disk base name per target for an artifact according to
 * the target's naming rule (FR-013). Prefix/suffix and casing are applied.
 */
export function computeName(artifact: Artifact, rule: NamingRule): string {
  const base = applyCasing(rawBase(artifact, rule.from ?? 'filename'), rule.casing ?? 'original');
  return `${rule.prefix ?? ''}${base}${rule.suffix ?? ''}`;
}
