import { validatePackages } from '../../../src/package/validate';
import { PackageValidationError } from '../../../src/package/errors';
import { enumeratePackageSource } from '../../../src/package/enumerate';
import { GuardedFs, ContainmentError } from '../../../src/write/guarded-fs';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('package safety: containment, symlink escape, destination isolation (T-013)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('AC-013/AC-028/AC-046: source-side path-traversal/symlink escape is rejected during enumeration', () => {
    const outside = makeTempRoot('prosaic-outside-');
    try {
      outside.write('secret.txt', 'nope');
      t.write('pkg/commands/ok.md', 'fine');
      t.symlink('pkg/scripts', outside.root);
      const result = enumeratePackageSource(t.p('pkg'));
      expect(result.warnings.some((w) => w.kind === 'package-path-rejected')).toBe(true);
      expect(result.runtimeFiles).toHaveLength(0);
      expect(result.neutralFiles.map((f) => f.relPath)).toEqual(['commands/ok.md']);
    } finally {
      outside.cleanup();
    }
  });

  it('AC-057: destination-side symlink resolving outside the project root is rejected, 0 bytes written', () => {
    const outside = makeTempRoot('prosaic-outside-');
    try {
      const gfs = new GuardedFs(t.root);
      t.write('.staging/file.md', 'payload');
      t.symlink('dest-link', outside.root);
      expect(() => gfs.moveFileAtomic('.staging/file.md', 'dest-link/pwned.md')).toThrow(
        ContainmentError,
      );
      expect(outside.exists('pwned.md')).toBe(false);
    } finally {
      outside.cleanup();
    }
  });

  it('AC-012/AC-045: a destination root escaping the project root is rejected at validation time', () => {
    t.write('pkg/commands/ok.md', 'fine');
    expect(() =>
      validatePackages(
        [{ id: 'pkg', sourceRoot: 'pkg', destinationRoot: '../../outside' }],
        t.root,
        [],
      ),
    ).toThrow(PackageValidationError);
  });

  it('AC-014/AC-047: sibling package destination overlap is rejected, both ids named', () => {
    t.write('pkg-a/commands/ok.md', 'a');
    t.write('pkg-b/commands/ok.md', 'b');
    try {
      validatePackages(
        [
          { id: 'pkg-a', sourceRoot: 'pkg-a', destinationRoot: 'shared' },
          { id: 'pkg-b', sourceRoot: 'pkg-b', destinationRoot: 'shared' },
        ],
        t.root,
        [],
      );
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toContain('pkg-a');
      expect((e as Error).message).toContain('pkg-b');
    }
  });

  it('AC-056: a destination overlapping a registered render target is rejected', () => {
    t.write('pkg/commands/ok.md', 'x');
    expect(() =>
      validatePackages(
        [{ id: 'pkg', sourceRoot: 'pkg', destinationRoot: '.claude/commands/nested' }],
        t.root,
        [t.p('.claude/commands')],
      ),
    ).toThrow(PackageValidationError);
  });

  it("FR-052: a package's own destinationRoot overlapping its own sourceRoot is rejected at config-validation time", () => {
    t.write('pkg/commands/ok.md', 'x');
    expect(() =>
      validatePackages([{ id: 'pkg', sourceRoot: 'pkg', destinationRoot: 'pkg' }], t.root, []),
    ).toThrow(PackageValidationError);
  });
});
