import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** An isolated temporary project root with real filesystem + symlink support. */
export interface TempRoot {
  root: string;
  /** Absolute path under the root. */
  p(rel: string): string;
  /** Write a file (creating parents) relative to the root. */
  write(rel: string, content: string): string;
  /** Read a file relative to the root. */
  read(rel: string): string;
  exists(rel: string): boolean;
  /** Create a symlink at `linkRel` pointing to `targetAbs`. */
  symlink(linkRel: string, targetAbs: string): void;
  cleanup(): void;
}

/** Create a fresh temp root under the OS temp dir; realpath'd so macOS /var works. */
export function makeTempRoot(prefix = 'prosaic-test-'): TempRoot {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const root = fs.realpathSync(base);

  const p = (rel: string): string => path.join(root, rel);
  return {
    root,
    p,
    write(rel: string, content: string): string {
      const abs = p(rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
      return abs;
    },
    read(rel: string): string {
      return fs.readFileSync(p(rel), 'utf8');
    },
    exists(rel: string): boolean {
      return fs.existsSync(p(rel));
    },
    symlink(linkRel: string, targetAbs: string): void {
      const abs = p(linkRel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.symlinkSync(targetAbs, abs);
    },
    cleanup(): void {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
