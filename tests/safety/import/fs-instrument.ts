import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';

/**
 * Runtime filesystem instrumentation for import-safety evidence.
 *
 * These helpers do NOT assert anything themselves — they *observe* the real
 * `fs` module while production code runs, so the resulting test-results
 * artifacts are measured-runtime evidence (actual syscall-level mutations
 * recorded during execution) rather than hand-maintained counters. Each mutating
 * `fs.*Sync` entry point is wrapped to append its resolved absolute destination
 * to a capture log before delegating to the genuine implementation.
 */

/** One recorded filesystem mutation observed during a run. */
export interface FsMutation {
  op: 'writeFileSync' | 'appendFileSync' | 'renameSync' | 'unlinkSync' | 'rmSync' | 'copyFileSync';
  /** Absolute destination path the mutation targeted. */
  target: string;
}

type Restore = () => void;

/**
 * Wrap the mutating `fs` entry points so every actual write/rename/delete that
 * production code performs is appended to `sink`. Returns a restore function
 * that reinstalls the originals; callers MUST invoke it in a `finally`.
 */
export function instrumentFsMutations(sink: FsMutation[]): Restore {
  // Patch the raw `fs` module object (not the `import * as fs` namespace, whose
  // members are getter-only). Production code compiled with esModuleInterop reads
  // each `fs.*` member through a delegating getter, so replacing the member on the
  // underlying module is observed by production at call time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  const realFs: any = require('fs');
  const original = {
    writeFileSync: realFs.writeFileSync,
    appendFileSync: realFs.appendFileSync,
    renameSync: realFs.renameSync,
    unlinkSync: realFs.unlinkSync,
    rmSync: realFs.rmSync,
    copyFileSync: realFs.copyFileSync,
  };

  const abs = (p: fs.PathLike): string => path.resolve(p.toString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realFs.writeFileSync = (file: fs.PathLike | number, data: any, opts?: any) => {
    if (typeof file !== 'number') sink.push({ op: 'writeFileSync', target: abs(file) });
    return original.writeFileSync(file, data, opts);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realFs.appendFileSync = (file: fs.PathLike | number, data: any, opts?: any) => {
    if (typeof file !== 'number') sink.push({ op: 'appendFileSync', target: abs(file) });
    return original.appendFileSync(file, data, opts);
  };
  realFs.renameSync = (from: fs.PathLike, to: fs.PathLike) => {
    sink.push({ op: 'renameSync', target: abs(to) });
    return original.renameSync(from, to);
  };
  realFs.unlinkSync = (p: fs.PathLike) => {
    sink.push({ op: 'unlinkSync', target: abs(p) });
    return original.unlinkSync(p);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realFs.rmSync = (p: fs.PathLike, opts?: any) => {
    sink.push({ op: 'rmSync', target: abs(p) });
    return original.rmSync(p, opts);
  };
  realFs.copyFileSync = (src: fs.PathLike, dest: fs.PathLike, mode?: number) => {
    sink.push({ op: 'copyFileSync', target: abs(dest) });
    return original.copyFileSync(src, dest, mode);
  };

  return () => {
    realFs.writeFileSync = original.writeFileSync;
    realFs.appendFileSync = original.appendFileSync;
    realFs.renameSync = original.renameSync;
    realFs.unlinkSync = original.unlinkSync;
    realFs.rmSync = original.rmSync;
    realFs.copyFileSync = original.copyFileSync;
  };
}

/**
 * Recursively hash every file under `root`, returning a `relativePath -> sha256`
 * map. Comparing two snapshots byte-for-byte proves whether any filesystem
 * modification occurred (used to measure FR-069 "exactly 0 modifications").
 */
export function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(root)) return out;

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        out[`${rel}/`] = 'dir';
        walk(full);
      } else if (entry.isSymbolicLink()) {
        out[rel] = `symlink:${fs.readlinkSync(full)}`;
      } else {
        const data = fs.readFileSync(full);
        out[rel] = crypto.createHash('sha256').update(data).digest('hex');
      }
    }
  };
  walk(root);
  return out;
}

/** Entries that differ between two tree snapshots (added, removed, or changed). */
export function diffTrees(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (before[k] !== after[k]) changed.push(k);
  }
  return changed.sort();
}
