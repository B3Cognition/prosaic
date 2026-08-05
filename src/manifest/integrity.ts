import * as crypto from 'crypto';

/** Stable SHA-256 hex digest of UTF-8 text or raw bytes (content provenance + integrity). */
export function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content as string, 'utf8').digest('hex');
}

/**
 * Compute the integrity digest over the manifest's meaningful payload. The
 * `integrity` field itself is excluded so the digest is self-consistent.
 */
export function computeManifestIntegrity(payload: unknown): string {
  return sha256(stableStringify(payload));
}

/**
 * Deterministic JSON stringify with sorted object keys, so the integrity digest
 * (and the on-disk manifest) is byte-stable across runs (NFR-012 support).
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
