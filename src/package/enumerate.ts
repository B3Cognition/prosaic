import * as fs from 'fs';
import * as path from 'path';
import { resolveContained, ContainmentError } from '../write/containment';
import { Warning } from '../domain/warnings';

/** The exactly-2 top-level directories whose contents form the Neutral Artifact Tree. */
const NEUTRAL_DIRS = ['commands', 'subagents'];

/** One enumerated package source entry. */
export interface EnumeratedFile {
  /** POSIX path relative to the package source root. */
  relPath: string;
  /** Absolute, real (symlink-resolved) path on disk. */
  absPath: string;
  /**
   * POSIX file mode bits captured at enumeration time (FR-013, Should-Have).
   * Populated for Package Runtime Tree entries only — Neutral Artifact Tree
   * files are out of scope for mode preservation.
   */
  mode?: number;
}

export interface EnumeratePackageSourceResult {
  /** `commands/` + `subagents/` contents — copied losslessly, never rendered. */
  neutralFiles: EnumeratedFile[];
  /** Every other top-level entry — copied opaquely, never parsed. */
  runtimeFiles: EnumeratedFile[];
  warnings: Warning[];
}

/**
 * Recursively enumerate a declared package's source tree (ADR-003/004/006),
 * partitioning it into the Neutral Artifact Tree (`commands/`, `subagents/`,
 * AC-034) and the Package Runtime Tree (every other top-level entry, any file
 * type, any depth). Every entry is `resolveContained`-checked against
 * `sourceRoot`; a path-traversal or symlink-escaping entry is rejected
 * individually with a `package-path-rejected` warning — enumeration continues
 * for every remaining entry (FR-027, AC-013, AC-028, AC-046). Strictly
 * read-only: never writes to `sourceRoot` (FR-052). Makes zero calls to
 * `discover()`, `walkSource()`, or `runPipeline()`.
 */
export function enumeratePackageSource(sourceRoot: string): EnumeratePackageSourceResult {
  const warnings: Warning[] = [];
  const neutralFiles: EnumeratedFile[] = [];
  const runtimeFiles: EnumeratedFile[] = [];

  let topEntries: fs.Dirent[];
  try {
    topEntries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  } catch {
    return { neutralFiles, runtimeFiles, warnings };
  }

  for (const entry of topEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = entry.name;
    const abs = path.join(sourceRoot, name);
    const resolved = checkContained(abs, sourceRoot, name, warnings);
    if (!resolved) continue;

    const stat = safeStat(abs, name, warnings);
    if (!stat) continue;

    if (stat.isDirectory() && NEUTRAL_DIRS.includes(name)) {
      walk(abs, sourceRoot, name, neutralFiles, warnings, false);
    } else if (stat.isDirectory()) {
      walk(abs, sourceRoot, name, runtimeFiles, warnings, true);
    } else if (stat.isFile()) {
      runtimeFiles.push({ relPath: name, absPath: resolved, mode: stat.mode });
    }
  }

  return { neutralFiles, runtimeFiles, warnings };
}

function walk(
  absDir: string,
  sourceRoot: string,
  relPrefix: string,
  bucket: EnumeratedFile[],
  warnings: Warning[],
  captureMode: boolean,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(absDir, entry.name);
    const rel = `${relPrefix}/${entry.name}`;
    const resolved = checkContained(abs, sourceRoot, rel, warnings);
    if (!resolved) continue;

    const stat = safeStat(abs, rel, warnings);
    if (!stat) continue;

    if (stat.isDirectory()) {
      walk(abs, sourceRoot, rel, bucket, warnings, captureMode);
    } else if (stat.isFile()) {
      bucket.push({ relPath: rel, absPath: resolved, ...(captureMode ? { mode: stat.mode } : {}) });
    }
  }
}

/** Resolve+contain one entry, or record a rejection warning and return null. */
function checkContained(
  abs: string,
  sourceRoot: string,
  rel: string,
  warnings: Warning[],
): string | null {
  try {
    return resolveContained(abs, sourceRoot);
  } catch (e) {
    if (e instanceof ContainmentError) {
      warnings.push({
        kind: 'package-path-rejected',
        artifact: rel,
        message: `rejected (path traversal or symlink escape outside the package source root): ${rel}`,
      });
      return null;
    }
    throw e;
  }
}

function safeStat(abs: string, rel: string, warnings: Warning[]): fs.Stats | null {
  try {
    return fs.statSync(abs);
  } catch (e) {
    warnings.push({
      kind: 'package-path-rejected',
      artifact: rel,
      message: `unreadable entry: ${rel} (${(e as Error).message})`,
    });
    return null;
  }
}
