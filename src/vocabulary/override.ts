import { Frontmatter } from '../domain/types';
import { TargetDescriptor } from '../registry/descriptor';

/**
 * Apply the target-specific override escape hatch (FR-016). An artifact may
 * carry `overrides: { <targetId>: { key: value } }` for intent that has no
 * neutral-vocabulary equivalent; the values for the current target are merged
 * into the concrete frontmatter, replacing any translated value.
 */
export function applyOverrides(
  concrete: Frontmatter,
  artifactFrontmatter: Frontmatter,
  descriptor: TargetDescriptor,
): Frontmatter {
  const overrides = artifactFrontmatter['overrides'];
  if (!overrides || typeof overrides !== 'object') return concrete;

  const forTarget = (overrides as Record<string, unknown>)[descriptor.id];
  if (!forTarget || typeof forTarget !== 'object') return concrete;

  return { ...concrete, ...(forTarget as Frontmatter) };
}
