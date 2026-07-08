import { Registry } from '../registry/registry';

/**
 * Guard against unknown target identifiers before any write (FR-040, FR-064).
 * Resolving the selection throws UnknownTargetError for any id absent from the
 * registry, so a run aborts before touching disk.
 */
export function assertKnownTargets(registry: Registry, selection: 'all' | string[]): void {
  registry.resolveSelection(selection);
}
