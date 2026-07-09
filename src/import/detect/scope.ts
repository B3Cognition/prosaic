import * as fs from 'fs';
import * as path from 'path';
import { TargetDescriptor } from '../../registry/descriptor';
import { SignatureIndex } from './signature-index';

/** A foreign file attributed to exactly one target (FR-078). */
export interface AttributedFile {
  /** Path of the file relative to projectRoot. */
  relToRoot: string;
  /** Absolute path. */
  abs: string;
  targetId: string;
}

/** Files that could not be attributed to any descriptor within the scope. */
export interface UnattributedFile {
  relToRoot: string;
  abs: string;
}

export interface ScopeResolution {
  attributed: AttributedFile[];
  unattributed: UnattributedFile[];
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.prosaic-backups']);

/**
 * Resolve exactly 1 target attribution per foreign file within the defined run scope
 * (FR-043, FR-078, FR-085). Files matching more than one target within the scope
 * are placed in unattributed (caller emits warning).
 *
 * When targetId is provided, every file in the scope directories is attributed to
 * that target (explicit-format path). Otherwise per-file attribution uses the index.
 */
export function resolveScope(
  scopeDirs: string[],
  projectRoot: string,
  descriptors: TargetDescriptor[],
  targetId?: string,
): ScopeResolution {
  const index = SignatureIndex.build(descriptors);
  const attributed: AttributedFile[] = [];
  const unattributed: UnattributedFile[] = [];

  for (const scopeDir of scopeDirs) {
    const files = walkDir(scopeDir, projectRoot);

    for (const { abs, relToRoot } of files) {
      if (targetId) {
        // Explicit format: attribute all files in scope to the named target (FR-003, FR-085)
        attributed.push({ relToRoot, abs, targetId });
        continue;
      }

      const candidates = index.matchFile(relToRoot);
      if (candidates.length === 1) {
        attributed.push({ relToRoot, abs, targetId: candidates[0] });
      } else {
        unattributed.push({ relToRoot, abs });
      }
    }
  }

  return { attributed, unattributed };
}

function walkDir(dir: string, projectRoot: string): Array<{ abs: string; relToRoot: string }> {
  const out: Array<{ abs: string; relToRoot: string }> = [];

  function recurse(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        recurse(abs);
      } else if (entry.isFile()) {
        const relToRoot = path.relative(projectRoot, abs).split(path.sep).join('/');
        out.push({ abs, relToRoot });
      }
    }
  }

  if (fs.existsSync(dir)) recurse(dir);
  return out;
}
