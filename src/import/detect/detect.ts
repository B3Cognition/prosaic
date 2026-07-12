import * as fs from 'fs';
import * as path from 'path';
import { TargetDescriptor } from '../../registry/descriptor';
import { Warning } from '../../domain/warnings';
import { DetectionOutcome } from '../types';
import { SignatureIndex } from './signature-index';

interface DetectResult {
  outcome: DetectionOutcome;
  warnings: Warning[];
}

/**
 * Walk the foreign directory and return all files with their paths relative
 * to the project root (so signature matching uses consistent paths).
 */
function walkForeignDir(foreignDir: string, projectRoot: string): string[] {
  const files: string[] = [];
  const skipDirs = new Set(['.git', 'node_modules', 'dist', '.prosaic-backups']);

  function recurse(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        recurse(abs);
      } else if (entry.isFile()) {
        const rel = path.relative(projectRoot, abs).split(path.sep).join('/');
        files.push(rel);
      }
    }
  }

  recurse(foreignDir);
  return files;
}

/**
 * Scan a foreign directory for every target whose signature matches its layout,
 * WITHOUT resolving or selecting a target (AC-007). This is deliberately distinct
 * from {@link detectFormat}: it performs no auto-detection resolution, so callers
 * on the explicit-`--format` path can learn whether a layout WOULD have been
 * ambiguous while still running auto-detection 0 times (FR-003).
 */
export function scanCandidates(
  foreignDir: string,
  projectRoot: string,
  descriptors: TargetDescriptor[],
): string[] {
  const index = SignatureIndex.build(descriptors);
  const files = walkForeignDir(foreignDir, projectRoot);

  const candidateIds = new Set<string>();
  for (const rel of files) {
    for (const id of index.matchFile(rel)) {
      candidateIds.add(id);
    }
  }
  return [...candidateIds];
}

/**
 * Auto-detect the source format of a foreign directory (FR-002).
 * Returns exactly 1 of 3 outcomes: single, ambiguous, or unrecognized.
 * Never selects 0 targets when outcome is ambiguous (FR-087).
 */
export function detectFormat(
  foreignDir: string,
  projectRoot: string,
  descriptors: TargetDescriptor[],
): DetectResult {
  const candidates = scanCandidates(foreignDir, projectRoot, descriptors);

  if (candidates.length === 0) {
    return {
      outcome: { kind: 'unrecognized' },
      warnings: [
        {
          kind: 'unrecognized-format',
          message:
            `No registered target matches the layout of "${foreignDir}". ` +
            `Supply an explicit format with --format <id>.`,
        },
      ],
    };
  }

  if (candidates.length > 1) {
    return {
      outcome: { kind: 'ambiguous', candidates },
      warnings: [
        {
          kind: 'ambiguous-detection',
          message:
            `Auto-detection matched ${candidates.length} targets: ${candidates.join(', ')}. ` +
            `Neutralize 0 files until you supply --format <id> to resolve the ambiguity.`,
        },
      ],
    };
  }

  return {
    outcome: { kind: 'single', targetId: candidates[0], method: 'auto-detected' },
    warnings: [],
  };
}

/** Validate an explicit format identifier against the registry (FR-003, FR-004, FR-046, FR-047). */
export function resolveExplicitFormat(
  formatId: string,
  descriptors: TargetDescriptor[],
): { ok: true; targetId: string } | { ok: false; error: string } {
  const ids = descriptors.map((d) => d.id).sort();
  const found = ids.includes(formatId);
  if (!found) {
    return {
      ok: false,
      error: `Unknown format identifier "${formatId}". Accepted identifiers: ${ids.join(', ')}`,
    };
  }
  return { ok: true, targetId: formatId };
}
