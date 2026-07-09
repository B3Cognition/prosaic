import * as fs from 'fs';
import * as path from 'path';

/**
 * Error raised when a write/delete target resolves outside the project root,
 * including escapes via `..` or a symlink (FR-027).
 */
export class ContainmentError extends Error {
  constructor(
    public readonly attemptedPath: string,
    public readonly resolvedPath: string,
    public readonly projectRoot: string,
  ) {
    super(
      `Refused: path escapes project root.\n` +
        `  attempted: ${attemptedPath}\n` +
        `  resolved:  ${resolvedPath}\n` +
        `  root:      ${projectRoot}`,
    );
    this.name = 'ContainmentError';
  }
}

/**
 * Resolve the real (symlink-followed) path of `target`, then assert it lies
 * inside `projectRoot`. For a path that does not yet exist, the nearest
 * existing ancestor is realpath-resolved and the remaining segments appended,
 * so a symlinked parent directory cannot smuggle a write outside the root.
 *
 * Returns the resolved absolute path when contained; throws ContainmentError
 * when the path escapes the root (FR-026, FR-027, FR-065, NFR-003).
 */
export function resolveContained(target: string, projectRoot: string): string {
  const realRoot = fs.realpathSync(projectRoot);
  const absTarget = path.resolve(realRoot, target);

  const resolved = realpathOfNearestExisting(absTarget);

  if (!isInside(resolved, realRoot)) {
    throw new ContainmentError(target, resolved, realRoot);
  }
  return resolved;
}

/**
 * Predicate form of {@link resolveContained}; never throws.
 */
export function isContained(target: string, projectRoot: string): boolean {
  try {
    resolveContained(target, projectRoot);
    return true;
  } catch {
    return false;
  }
}

/** True when `child` is `parent` itself or lives beneath it. */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Realpath the deepest existing ancestor of `absTarget`, then re-append the
 * not-yet-existing tail. This defeats a symlinked intermediate directory: the
 * existing symlink is followed to its real location before the tail is joined.
 */
function realpathOfNearestExisting(absTarget: string): string {
  let existing = absTarget;
  const tail: string[] = [];

  // Walk up until we find a path that exists on disk.
  // Guard against reaching the filesystem root.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fs.existsSync(existing)) {
      break;
    }
    const parent = path.dirname(existing);
    if (parent === existing) {
      // Reached filesystem root without finding an existing segment.
      return absTarget;
    }
    tail.unshift(path.basename(existing));
    existing = parent;
  }

  const realExisting = fs.realpathSync(existing);
  return tail.length === 0 ? realExisting : path.join(realExisting, ...tail);
}
