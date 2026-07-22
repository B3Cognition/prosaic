/**
 * On-disk name of the managed-paths manifest, at the project root. Kept in its
 * own module (no `write/**` dependency) so read-only consumers like discovery
 * can reference it without transitively importing the manifest writer.
 */
export const MANIFEST_FILENAME = '.prosaic-manifest.json';
