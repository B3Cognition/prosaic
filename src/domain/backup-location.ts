import * as path from 'path';

/**
 * The contained directory that holds prior-content backups. It lives inside the
 * project root (so backups pass containment) and is excluded from artifact
 * discovery (FR-055) — see {@link isBackupPath}. Pure path arithmetic, no I/O,
 * so both the write path (`write/backup.ts`) and the read path
 * (`discovery/walk.ts`) can depend on it without either pulling in the other.
 */
export const BACKUP_DIR_NAME = '.prosaic-backups';

/** Absolute path of the backup root for a given project root. */
export function backupRoot(projectRoot: string): string {
  return path.join(projectRoot, BACKUP_DIR_NAME);
}

/**
 * True when `candidate` is inside the backup location, so discovery can skip it
 * and never re-ingest a backup as a source artifact (FR-055).
 */
export function isBackupPath(candidate: string, projectRoot: string): boolean {
  const rel = path.relative(backupRoot(projectRoot), path.resolve(projectRoot, candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Compute the backup file name for the Nth backup of a managed file. Backups
 * mirror the project-relative path of their source under the backup root, with
 * a numeric suffix so retention pruning can order them.
 */
export function backupPathFor(
  projectRoot: string,
  managedAbsPath: string,
  sequence: number,
): string {
  const rel = path.relative(projectRoot, managedAbsPath);
  return path.join(backupRoot(projectRoot), `${rel}.bak.${sequence}`);
}

/** Match a backup file name back to its sequence number (or null). */
export function backupSequence(fileName: string): number | null {
  const m = /\.bak\.(\d+)$/.exec(fileName);
  return m ? Number(m[1]) : null;
}
