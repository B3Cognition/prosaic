import * as fs from 'fs';
import { GuardedFs, ContainmentError } from '../../src/write/guarded-fs';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

describe('GuardedFs.moveFileAtomic (T-005, FR-025/FR-043/FR-045)', () => {
  let t: TempRoot;
  let gfs: GuardedFs;

  beforeEach(() => {
    t = makeTempRoot();
    gfs = new GuardedFs(t.root);
  });
  afterEach(() => t.cleanup());

  it('a valid same-root rename succeeds atomically', () => {
    t.write('.staging/file.md', 'hello');
    gfs.moveFileAtomic('.staging/file.md', 'dest/file.md');
    expect(t.exists('.staging/file.md')).toBe(false);
    expect(t.read('dest/file.md')).toBe('hello');
  });

  it('AC-043/AC-044: a source resolving outside the project root via traversal is rejected', () => {
    t.write('.staging/file.md', 'hello');
    expect(() => gfs.moveFileAtomic('../../etc/passwd', 'dest/file.md')).toThrow(ContainmentError);
  });

  it('AC-043/AC-044: a destination resolving outside the project root via traversal is rejected', () => {
    t.write('.staging/file.md', 'hello');
    expect(() => gfs.moveFileAtomic('.staging/file.md', '../escape.md')).toThrow(ContainmentError);
    expect(t.exists('.staging/file.md')).toBe(true);
  });

  it('AC-057: a destination symlink resolving outside the project root is rejected, 0 bytes written', () => {
    const outside = makeTempRoot('prosaic-outside-');
    try {
      t.write('.staging/file.md', 'hello');
      t.symlink('linkdir', outside.root);
      expect(() => gfs.moveFileAtomic('.staging/file.md', 'linkdir/pwned.md')).toThrow(
        ContainmentError,
      );
      expect(outside.exists('pwned.md')).toBe(false);
      expect(t.exists('.staging/file.md')).toBe(true);
    } finally {
      outside.cleanup();
    }
  });

  it('creates the destination parent directory as needed', () => {
    t.write('.staging/file.md', 'hi');
    gfs.moveFileAtomic('.staging/file.md', 'a/b/c/file.md');
    expect(fs.existsSync(t.p('a/b/c/file.md'))).toBe(true);
  });
});
