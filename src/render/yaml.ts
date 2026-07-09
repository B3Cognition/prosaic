import * as yaml from 'js-yaml';
import { Frontmatter } from '../domain/types';
import { canonicalOrder } from './order';

/** Shared js-yaml dump options tuned for deterministic, unwrapped output. */
const DUMP_OPTS: yaml.DumpOptions = {
  lineWidth: -1,
  noRefs: true,
  noCompatMode: true,
  quotingType: '"',
  forceQuotes: false,
  sortKeys: false,
};

/**
 * Serialize a frontmatter map to canonical YAML (deterministic key order and
 * quoting), producing byte-identical output across repeated renders (NFR-009).
 * Returns the YAML text (with trailing newline) or empty string for an empty map.
 */
export function dumpYaml(fm: Frontmatter): string {
  if (Object.keys(fm).length === 0) return '';
  return yaml.dump(canonicalOrder(fm), DUMP_OPTS);
}

/**
 * Canonical YAML whole-file serializer (ADR-007) for YAML recipe targets. Maps
 * the artifact's frontmatter fields plus its body (under `bodyField`) into one
 * deterministic YAML document (FR-020).
 */
export function renderYamlFile(fm: Frontmatter, body: string, bodyField: string): string {
  const doc: Frontmatter = { ...fm };
  doc[bodyField] = body.trimEnd() + '\n';
  return yaml.dump(canonicalOrder(doc), DUMP_OPTS);
}
