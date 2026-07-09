import * as path from 'path';
import { Artifact } from '../../domain/types';
import { Warning } from '../../domain/warnings';
import { GuardedFs, ContainmentError } from '../../write/guarded-fs';
import { renderMarkdown } from '../../render/markdown';

export interface WriteResult {
  written: boolean;
  /** Destination path relative to project root. */
  destPath: string;
  collision: boolean;
  preview?: string;
  warnings: Warning[];
}

/**
 * Write an imported neutral artifact as prosaic source inside the source directory
 * (FR-031, FR-032, FR-033, FR-034, FR-035, FR-067, FR-069, FR-082, FR-086, NFR-004).
 *
 * Guarantees:
 * - Destination resolves inside the project root (FR-032); symlink/traversal refused (FR-067)
 * - User-authored collision without overwrite: 0 files overwritten, collision reported (FR-033, FR-068)
 * - Foreign source directory: 0 files changed (FR-034)
 * - Preview mode: 0 filesystem modifications (FR-069)
 * - No manifest entry recorded (FR-082)
 * - No existing user-authored source deleted (FR-086)
 */
export function writeSource(
  artifact: Artifact,
  sourceRoot: string,
  projectRoot: string,
  options: { dryRun?: boolean; overwrite?: boolean },
): WriteResult {
  const fsGate = new GuardedFs(projectRoot);
  const warnings: Warning[] = [];

  const destRelToProject = path.join(
    path.relative(projectRoot, sourceRoot),
    artifact.sourcePath,
  ).split(path.sep).join('/');

  // FR-032, FR-067: assert destination contained before any write
  let destAbs: string;
  try {
    destAbs = fsGate.assertContained(destRelToProject);
  } catch (e) {
    if (e instanceof ContainmentError) {
      const w: Warning = {
        kind: 'malformed-frontmatter',
        artifact: artifact.id,
        message: `Write refused: destination "${destRelToProject}" escapes project root. ${e.message}`,
      };
      return {
        written: false,
        destPath: destRelToProject,
        collision: false,
        warnings: [w],
      };
    }
    throw e;
  }

  // FR-033, FR-068: collision detection with existing user-authored source
  const exists = fsGate.exists(destRelToProject);
  if (exists && !options.overwrite) {
    warnings.push({
      kind: 'malformed-frontmatter',
      artifact: artifact.id,
      message:
        `Collision: source file "${destRelToProject}" already exists and was authored by the user. ` +
        `Skipping write. Use --overwrite to replace it.`,
    });
    return {
      written: false,
      destPath: destRelToProject,
      collision: true,
      preview: `[skip] ${destRelToProject} (collision — existing user-authored file)`,
      warnings,
    };
  }

  // Render the neutral artifact as Markdown source
  const content = renderMarkdown(artifact.frontmatter, artifact.body);
  const preview = `${exists ? '[overwrite]' : '[create]'} ${destRelToProject}`;

  if (options.dryRun) {
    // FR-035, FR-069: in preview mode, 0 filesystem modifications
    return { written: false, destPath: destRelToProject, collision: false, preview, warnings };
  }

  // FR-031: write into source directory using atomic temp-write-then-rename
  fsGate.writeFileAtomic(destRelToProject, content);

  // Write bundle resources alongside the primary (FR-073)
  if (artifact.resources && artifact.resources.length > 0) {
    const destDir = path.posix.dirname(destRelToProject);
    for (const resource of artifact.resources) {
      const resourcePath = `${destDir}/${resource.relPath}`;
      try {
        fsGate.assertContained(resourcePath);
        if (!options.dryRun) {
          fsGate.writeFileAtomic(resourcePath, resource.content);
        }
      } catch {
        warnings.push({
          kind: 'unresolved-reference',
          artifact: artifact.id,
          message: `Bundle resource "${resource.relPath}" write refused: path escapes project root.`,
        });
      }
    }
  }

  return { written: true, destPath: destRelToProject, collision: false, preview, warnings };
}
