import * as fs from 'fs';
import * as path from 'path';
import { GuardedFs } from './guarded-fs';
import { backupRoot, backupPathFor, backupSequence } from './backup-location';

/** Default retention bound: at most 3 backups per file (FR-049, AC-033). */
export const DEFAULT_MAX_BACKUPS = 3;

/**
 * Writes prior-content backups before a content-changing overwrite (FR-025) and
 * prunes so no more than `maxBackups` are retained per file, deleting the oldest
 * surplus first (FR-049). Backups live in a discovery-excluded, contained
 * location (FR-055) and every write goes through the GuardedFs so containment
 * still holds (NFR-003).
 */
export class BackupManager {
  constructor(
    private readonly fsGate: GuardedFs,
    private readonly maxBackups: number = DEFAULT_MAX_BACKUPS,
  ) {}

  /**
   * Back up the current content of `managedAbsPath` (which must exist) and
   * return the absolute path of the backup written. The overwrite may not
   * proceed until this returns (FR-056) — callers invoke this first.
   */
  backup(managedAbsPath: string): string {
    const root = this.fsGate.root;
    const existing = this.listBackups(managedAbsPath);
    const nextSeq = existing.length === 0 ? 1 : existing[existing.length - 1].seq + 1;

    const dest = backupPathFor(root, managedAbsPath, nextSeq);
    const prior = fs.readFileSync(managedAbsPath);
    this.fsGate.writeFile(dest, prior);

    this.prune(managedAbsPath);
    return dest;
  }

  /** List existing backups for a file, oldest first, by sequence number. */
  listBackups(managedAbsPath: string): Array<{ seq: number; abs: string }> {
    const root = this.fsGate.root;
    const rel = path.relative(root, managedAbsPath);
    const dir = path.join(backupRoot(root), path.dirname(rel));
    if (!fs.existsSync(dir)) return [];

    const base = path.basename(rel);
    const out: Array<{ seq: number; abs: string }> = [];
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(`${base}.bak.`)) continue;
      const seq = backupSequence(name);
      if (seq === null) continue;
      out.push({ seq, abs: path.join(dir, name) });
    }
    return out.sort((a, b) => a.seq - b.seq);
  }

  /** Remove the oldest surplus so at most `maxBackups` remain (FR-049). */
  private prune(managedAbsPath: string): void {
    let backups = this.listBackups(managedAbsPath);
    while (backups.length > this.maxBackups) {
      const oldest = backups[0];
      this.fsGate.deleteFile(oldest.abs);
      backups = backups.slice(1);
    }
  }
}
