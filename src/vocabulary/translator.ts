import { Frontmatter } from '../domain/types';
import { TargetDescriptor, NeutralKey, NEUTRAL_KEYS } from '../registry/descriptor';

export interface TranslationResult {
  /** Concrete target frontmatter entries produced from neutral keys. */
  concrete: Frontmatter;
  /** Neutral keys that were present but non-representable on this target (FR-018). */
  dropped: NeutralKey[];
}

/**
 * The `execution` intent is represented structurally by deployment-type routing
 * (Stage 8), so an untranslated `execution` is never counted as a lossy drop.
 */
const STRUCTURAL_KEYS = new Set<NeutralKey>(['execution']);

/**
 * Translate every declared neutral behavior key into the target's concrete
 * frontmatter (FR-015). A neutral key with a translation rule emits the mapped
 * concrete key/value; a present neutral key with no rule is reported as dropped
 * so the caller can warn (FR-018). The `execution` key is consumed by routing.
 */
export function translateNeutral(
  frontmatter: Frontmatter,
  descriptor: TargetDescriptor,
): TranslationResult {
  const concrete: Frontmatter = {};
  const dropped: NeutralKey[] = [];
  const translations = descriptor.translations ?? {};

  for (const key of NEUTRAL_KEYS) {
    if (!(key in frontmatter)) continue;
    const rule = translations[key];
    const neutralValue = frontmatter[key];

    if (!rule || rule.drop || !rule.toKey) {
      if (!STRUCTURAL_KEYS.has(key)) dropped.push(key);
      continue;
    }

    concrete[rule.toKey] = mapValue(neutralValue, rule.valueMap);
  }

  return { concrete, dropped };
}

function mapValue(value: unknown, valueMap?: Record<string, unknown>): unknown {
  if (valueMap && typeof value === 'string' && value in valueMap) {
    return valueMap[value];
  }
  return value;
}
