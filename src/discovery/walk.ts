import * as fs from 'fs';
import * as path from 'path';
import { isBackupPath } from '../write/backup-location';
import { MANIFEST_FILENAME } from '../manifest/manifest';

export interface WalkedFile {
  /** Absolute path on disk. */
  abs: string;
  /** POSIX path relative to the source root. */
  rel: string;
}

/** Directories never descended during discovery. */
const ALWAYS_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.prosaic-backups']);

/**
 * Walk the source of truth, returning every Markdown file. The backup location
 * (FR-055) and the manifest file are excluded so backups and provenance state
 * are never re-ingested as source artifacts.
 */
export function walkSource(sourceRoot: string, projectRoot: string): WalkedFile[] {
  const out: WalkedFile[] = [];
  if (!fs.existsSync(sourceRoot)) return out;

  const stack: string[] = [sourceRoot];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (isBackupPath(abs, projectRoot)) continue;
      if (entry.isDirectory()) {
        if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (path.basename(abs) === MANIFEST_FILENAME) continue;
      if (!abs.toLowerCase().endsWith('.md')) continue;
      out.push({ abs, rel: path.relative(sourceRoot, abs).split(path.sep).join('/') });
    }
  }
  // Deterministic order so discovery + reporting are stable across runs.
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
