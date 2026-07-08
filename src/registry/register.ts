import { TargetDescriptor, validateDescriptor, parseDescriptor } from './descriptor';
import { Registry, StaticRegistrySource } from './registry';
import { RegistryVersion, REGISTRY_VERSION } from './version';

/**
 * Admit a new target from exactly one declarative adapter descriptor with zero
 * changes to core transformation logic (FR-008). Coverage grows as data: the
 * new descriptor joins the existing set and the same core pipeline distributes
 * to it. A malformed descriptor is rejected before admission.
 */
export function registerTarget(
  existing: TargetDescriptor[],
  descriptor: unknown,
  version: RegistryVersion = REGISTRY_VERSION,
): Registry {
  const validation = validateDescriptor(descriptor);
  if (!validation.ok) {
    throw new Error(`Cannot register target: ${validation.error}`);
  }
  const parsed = parseDescriptor(descriptor);
  if (existing.some((d) => d.id === parsed.id)) {
    throw new Error(`Cannot register target: id "${parsed.id}" already exists`);
  }
  return new Registry(new StaticRegistrySource([...existing, parsed], version));
}
