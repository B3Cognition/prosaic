import * as fs from 'fs';
import * as path from 'path';
import { resolveContained, ContainmentError } from './containment';

export { ContainmentError };

/**
 * The one module permitted to mutate the filesystem (ADR-006). Every write and
 * every delete is routed through here so a single containment check (FR-026,
 * FR-027) guards 100% of mutations (NFR-003). No output is ever emitted outside
 * a target's declared directory (FR-065) because the caller-supplied path is
 * resolved and asserted inside the project root before any byte is written.
 */
export class GuardedFs {
  constructor(private readonly projectRoot: string) {
    if (!path.isAbsolute(projectRoot)) {
      throw new Error(`projectRoot must be absolute: ${projectRoot}`);
    }
  }

  get root(): string {
    return this.projectRoot;
  }

  /** True when `absOrRel` resolves inside the project root (no throw). */
  contains(absOrRel: string): boolean {
    try {
      resolveContained(absOrRel, this.projectRoot);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve `target` under the root, refusing escapes. Public so callers can
   * pre-flight a path (e.g. the planner) using the identical check the writer
   * applies (NFR-003 — one containment gate).
   */
  assertContained(target: string): string {
    return resolveContained(target, this.projectRoot);
  }

  /** True when the contained path currently exists on disk. */
  exists(target: string): boolean {
    const resolved = resolveContained(target, this.projectRoot);
    return fs.existsSync(resolved);
  }

  /** Read a contained file as UTF-8; throws if it escapes the root. */
  readFile(target: string): string {
    const resolved = resolveContained(target, this.projectRoot);
    return fs.readFileSync(resolved, 'utf8');
  }

  /**
   * Write `content` to `target`, creating parent directories as needed. The
   * path is resolved and asserted contained first (FR-026); an escaping path is
   * refused with a ContainmentError naming the escaping path (FR-027).
   */
  writeFile(target: string, content: string | Buffer): void {
    const resolved = resolveContained(target, this.projectRoot);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content);
  }

  /**
   * Atomically write via temp-plus-rename inside the same directory, so an
   * interrupted or concurrent write never leaves a partial file (NFR-012).
   */
  writeFileAtomic(target: string, content: string | Buffer): void {
    const resolved = resolveContained(target, this.projectRoot);
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `.${path.basename(resolved)}.tmp-${process.pid}-${writeCounter()}`);
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, resolved);
  }

  /**
   * Delete a contained file. An escaping path — including one reached via a
   * symlink — is refused before any unlink (FR-027).
   */
  deleteFile(target: string): void {
    const resolved = resolveContained(target, this.projectRoot);
    if (fs.existsSync(resolved)) {
      fs.rmSync(resolved, { force: true });
    }
  }

  /** Copy a contained source to a contained destination. */
  copyFile(source: string, dest: string): void {
    const resolvedSrc = resolveContained(source, this.projectRoot);
    const resolvedDest = resolveContained(dest, this.projectRoot);
    fs.mkdirSync(path.dirname(resolvedDest), { recursive: true });
    fs.copyFileSync(resolvedSrc, resolvedDest);
  }

  /** List the immediate file names in a contained directory (empty if absent). */
  listDir(target: string): string[] {
    const resolved = resolveContained(target, this.projectRoot);
    if (!fs.existsSync(resolved)) return [];
    return fs.readdirSync(resolved);
  }

  mkdirp(target: string): void {
    const resolved = resolveContained(target, this.projectRoot);
    fs.mkdirSync(resolved, { recursive: true });
  }
}

let _counter = 0;
function writeCounter(): number {
  _counter = (_counter + 1) % Number.MAX_SAFE_INTEGER;
  return _counter;
}
