import { Frontmatter } from '../domain/types';

/**
 * Preferred leading key order for emitted frontmatter, so common keys read
 * naturally. Remaining keys follow in stable alphabetical order. The ordering is
 * fixed, making structured output byte-identical across runs (NFR-009, FR-021).
 */
const PREFERRED_ORDER = ['name', 'description', 'title', 'model', 'color', 'tools'];

/** Return a new object whose keys are in the canonical deterministic order. */
export function canonicalOrder(fm: Frontmatter): Frontmatter {
  const keys = Object.keys(fm);
  const preferred = PREFERRED_ORDER.filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !PREFERRED_ORDER.includes(k)).sort();
  const ordered: Frontmatter = {};
  for (const k of [...preferred, ...rest]) {
    ordered[k] = fm[k];
  }
  return ordered;
}
