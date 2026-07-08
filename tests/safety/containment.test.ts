import { GuardedFs, ContainmentError } from '../../src/write/guarded-fs';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

describe('GuardedFs containment (T-002, FR-026/FR-027/FR-065)', () => {
  let t: TempRoot;
  let gfs: GuardedFs;

  beforeEach(() => {
    t = makeTempRoot();
    gfs = new GuardedFs(t.root);
  });
  afterEach(() => t.cleanup());

  it('AC-026: a write whose real path resolves inside the root proceeds', () => {
    gfs.writeFile('.claude/commands/foo.md', 'hello');
    expect(t.read('.claude/commands/foo.md')).toBe('hello');
  });

  it('AC-027: a ".." path escape is refused with the path reported', () => {
    expect(() => gfs.writeFile('../escape.md', 'x')).toThrow(ContainmentError);
    expect(t.exists('../escape.md')).toBe(false);
  });

  it('AC-027: a symlink pointing outside the root is refused', () => {
    const outside = makeTempRoot('prosaic-outside-');
    try {
      // A symlinked directory inside the root that points outside it.
      t.symlink('linkdir', outside.root);
      expect(() => gfs.writeFile('linkdir/pwned.md', 'x')).toThrow(ContainmentError);
      expect(outside.exists('pwned.md')).toBe(false);
    } finally {
      outside.cleanup();
    }
  });

  it('AC-027: a delete escaping via symlink is refused', () => {
    const outside = makeTempRoot('prosaic-outside-');
    try {
      outside.write('secret.md', 'keep me');
      t.symlink('linkdir', outside.root);
      expect(() => gfs.deleteFile('linkdir/secret.md')).toThrow(ContainmentError);
      expect(outside.exists('secret.md')).toBe(true);
    } finally {
      outside.cleanup();
    }
  });

  it('contains() reports true inside and false outside the root', () => {
    expect(gfs.contains('a/b/c.md')).toBe(true);
    expect(gfs.contains('../../etc/passwd')).toBe(false);
  });
});
