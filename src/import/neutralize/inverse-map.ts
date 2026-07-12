import { TargetDescriptor, NeutralKey, NEUTRAL_KEYS } from '../../registry/descriptor';
import { Frontmatter } from '../../domain/types';

export interface InverseMapEntry {
  neutralKey: NeutralKey;
  reverseValue?: (concreteValue: unknown) => unknown;
}

export type InverseMap = Map<string, InverseMapEntry>;

export class NonInjectiveValueMapError extends Error {
  constructor(targetId: string, neutralKey: string) {
    super(
      `Target "${targetId}" has a non-injective valueMap for neutral key "${neutralKey}" ` +
        `without inverse metadata. Cannot safely invert — refusing import for this target.`,
    );
    this.name = 'NonInjectiveValueMapError';
  }
}

/**
 * Build the inverse translation map for a descriptor: concrete key → neutral key
 * with optional reverse value mapping (FR-010, FR-054, FR-019, FR-081).
 *
 * Enforces injectivity: if two neutral keys share the same toKey, or a valueMap
 * lacks inverse metadata (is non-injective), throws NonInjectiveValueMapError.
 * Maps 0 concrete-only keys to neutral behavior keys (FR-081).
 */
export function buildInverseMap(desc: TargetDescriptor): InverseMap {
  const inverseMap: InverseMap = new Map();
  const translations = desc.translations ?? {};

  for (const key of NEUTRAL_KEYS) {
    const rule = translations[key as NeutralKey];
    if (!rule || rule.drop || !rule.toKey) continue;

    const concreteKey = rule.toKey;

    // Injectivity check: two neutral keys mapping to the same concrete key
    if (inverseMap.has(concreteKey)) {
      throw new NonInjectiveValueMapError(desc.id, key);
    }

    let reverseValue: ((v: unknown) => unknown) | undefined;

    if (rule.valueMap && Object.keys(rule.valueMap).length > 0) {
      // Build reverse value map: concrete value → neutral value
      const fwd = rule.valueMap as Record<string, unknown>;
      const rev = new Map<string, string>();
      for (const [neutralVal, concreteVal] of Object.entries(fwd)) {
        const ck = String(concreteVal);
        if (rev.has(ck)) {
          // Non-injective value map: two neutral values map to same concrete value
          throw new NonInjectiveValueMapError(desc.id, key);
        }
        rev.set(ck, neutralVal);
      }
      reverseValue = (v: unknown) => rev.get(String(v)) ?? v;
    }

    inverseMap.set(concreteKey, { neutralKey: key as NeutralKey, reverseValue });
  }

  return inverseMap;
}

/**
 * Apply the inverse map to a concrete frontmatter, returning recovered neutral
 * key-value pairs. Keys not in the inverse map are left for recoverOverrides.
 */
export function applyInverseMap(
  concreteFm: Frontmatter,
  inverseMap: InverseMap,
): { neutral: Frontmatter; remaining: Frontmatter } {
  const neutral: Frontmatter = {};
  const remaining: Frontmatter = {};

  for (const [concreteKey, value] of Object.entries(concreteFm)) {
    const entry = inverseMap.get(concreteKey);
    if (entry) {
      const neutralValue = entry.reverseValue ? entry.reverseValue(value) : value;
      neutral[entry.neutralKey] = neutralValue;
    } else {
      remaining[concreteKey] = value;
    }
  }

  return { neutral, remaining };
}
