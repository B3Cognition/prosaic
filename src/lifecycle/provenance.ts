import { Manifest } from '../manifest/manifest';

export type Provenance = 'absent' | 'managed' | 'user-authored';

/**
 * Classify a file's provenance for the apply guard (FR-061). A path recorded in
 * the manifest for the given target is tool-generated ("managed"); an existing
 * path with no record is "user-authored" and must never be modified; a
 * non-existent path is "absent".
 */
export function classifyProvenance(
  manifest: Manifest,
  targetId: string,
  relPath: string,
  existsOnDisk: boolean,
): Provenance {
  if (manifest.isManaged(targetId, relPath)) return 'managed';
  return existsOnDisk ? 'user-authored' : 'absent';
}
