import * as TOML from '@iarna/toml';
import { Frontmatter } from '../domain/types';
import { canonicalOrder } from './order';

/**
 * Coerce values into TOML-representable JSON values, dropping null/undefined
 * (TOML has no null). Nested objects/arrays are coerced recursively so the
 * @iarna/toml stringifier never throws on an unsupported value.
 */
function coerce(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(coerce).filter((v) => v !== undefined);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const c = coerce(v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return value;
}

/**
 * Canonical TOML whole-file serializer (ADR-007) for TOML command targets. Maps
 * the frontmatter fields plus the body (under `bodyField`) into one TOML
 * document with deterministic key ordering and quoting (FR-020, NFR-009).
 */
export function renderTomlFile(fm: Frontmatter, body: string, bodyField: string): string {
  const doc: Frontmatter = { ...fm };
  doc[bodyField] = body.trimEnd() + '\n';
  const ordered = canonicalOrder(doc);
  const coerced = coerce(ordered) as Record<string, unknown>;
  return TOML.stringify(coerced as TOML.JsonMap);
}
