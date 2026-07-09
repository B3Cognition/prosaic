import * as fs from 'fs';
import * as path from 'path';
import { Warning } from '../../domain/warnings';
import { TargetDescriptor } from '../../registry/descriptor';
import { Artifact, Frontmatter } from '../../domain/types';
import { parseArtifact } from '../../discovery/parse';

export interface IdempotencyCheckResult {
  idempotent: boolean;
  divergences: Array<{ sourcePath: string; reason: string }>;
  warnings: Warning[];
}

/**
 * Source-level idempotency check: re-import the freshly written neutral source
 * using the same descriptor, then compare the twice-imported neutral frontmatter
 * against the once-imported (FR-040, FR-072, NFR-002).
 *
 * A divergence means inject pollution or some other non-convergent transformation.
 * The check catches issues that byte round-trip alone masks (A-008).
 */
export function idempotencyCheck(
  onceImported: Artifact,
  desc: TargetDescriptor,
  sourceRoot: string,
  projectRoot: string,
): IdempotencyCheckResult {
  const warnings: Warning[] = [];
  const divergences: Array<{ sourcePath: string; reason: string }> = [];
  const foreignPath = onceImported.sourcePath;

  // The freshly written source file path
  const writtenPath = path.join(sourceRoot, onceImported.sourcePath);

  if (!fs.existsSync(writtenPath)) {
    return {
      idempotent: true,
      divergences: [],
      warnings: [
        {
          kind: 'malformed-frontmatter',
          artifact: foreignPath,
          message: `Idempotency check skipped: written source file "${writtenPath}" not found.`,
        },
      ],
    };
  }

  // Read the written neutral source file directly — it is already neutral markdown,
  // not a foreign target file, so we parse it with parseArtifact (not via the target descriptor).
  let rawContent: string;
  try {
    rawContent = fs.readFileSync(writtenPath, 'utf8');
  } catch (e) {
    divergences.push({
      sourcePath: onceImported.sourcePath,
      reason: `Could not read written source: ${(e as Error).message}`,
    });
    return { idempotent: false, divergences, warnings };
  }

  let secondArtifact: Artifact;
  try {
    const parsed = parseArtifact(rawContent);
    secondArtifact = {
      id: onceImported.id,
      type: onceImported.type,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      sourcePath: onceImported.sourcePath,
    };
  } catch (e) {
    divergences.push({
      sourcePath: onceImported.sourcePath,
      reason: `Could not parse written neutral source: ${(e as Error).message}`,
    });
    return { idempotent: false, divergences, warnings };
  }
  const diverged = findDivergences(onceImported.frontmatter, secondArtifact.frontmatter);

  if (diverged.length > 0) {
    for (const d of diverged) {
      divergences.push({ sourcePath: onceImported.sourcePath, reason: d });
      warnings.push({
        kind: 'round-trip-mismatch',
        artifact: foreignPath,
        message: `Source-level idempotency divergence in "${onceImported.sourcePath}": ${d}`,
      });
    }
    return { idempotent: false, divergences, warnings };
  }

  return { idempotent: true, divergences: [], warnings };
}

function findDivergences(fm1: Frontmatter, fm2: Frontmatter): string[] {
  const issues: string[] = [];
  const keys = new Set([...Object.keys(fm1), ...Object.keys(fm2)]);
  for (const key of keys) {
    const v1 = JSON.stringify(fm1[key]);
    const v2 = JSON.stringify(fm2[key]);
    if (v1 !== v2) {
      issues.push(`key "${key}" changed: ${v1} → ${v2}`);
    }
  }
  return issues;
}
