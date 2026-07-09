import { ResourceFile } from '../domain/types';
import { Warning } from '../domain/warnings';

/** Markdown inline link/image target: `](path)`. */
const LINK_RE = /(!?\[[^\]]*\]\()([^)\s]+)(\))/g;

export interface ReferenceRewrite {
  text: string;
  warnings: Warning[];
}

/** True when a link target points outside the bundle (URL, mail, absolute). */
function isExternal(target: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(target) || // scheme: http:, mailto:, etc.
    target.startsWith('/') ||
    target.startsWith('#')
  );
}

/** Normalize an intra-bundle relative reference (drop leading ./, anchors, query). */
function normalizeRef(target: string): string {
  let t = target.split('#')[0].split('?')[0];
  t = t.replace(/^\.\//, '');
  return t;
}

/**
 * Rewrite intra-bundle path references so they resolve after install (FR-012),
 * validating each against the bundle's resource set. An internal reference to an
 * absent resource emits a warning naming the unresolved reference rather than
 * shipping a broken link (AC-013). References resolve against the set of
 * resource relPaths, which are preserved relative to the primary output.
 */
export function rewriteReferences(
  text: string,
  resources: ResourceFile[],
  artifactId: string,
  targetId: string,
): ReferenceRewrite {
  const resourceSet = new Set(resources.map((r) => normalizeRef(r.relPath)));
  const warnings: Warning[] = [];

  const rewritten = text.replace(LINK_RE, (_full, pre: string, target: string, post: string) => {
    if (isExternal(target)) return `${pre}${target}${post}`;
    const norm = normalizeRef(target);
    // A bare same-name anchor or empty ref is not a resource reference.
    if (norm === '') return `${pre}${target}${post}`;
    if (!resourceSet.has(norm)) {
      warnings.push({
        kind: 'unresolved-reference',
        artifact: artifactId,
        target: targetId,
        message: `internal reference "${target}" does not resolve to a bundle resource`,
      });
    }
    // Relative structure is preserved on relocation, so the target is unchanged.
    return `${pre}${target}${post}`;
  });

  return { text: rewritten, warnings };
}
