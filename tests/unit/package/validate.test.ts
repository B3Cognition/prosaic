import { validatePackages, resolveDeclaredPackage } from '../../../src/package/validate';
import { PackageValidationError, UnknownPackageError } from '../../../src/package/errors';
import { PackageDeclaration } from '../../../src/package/types';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('validatePackages (T-002, FR-026/FR-028/FR-046/FR-048/FR-052)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  function decl(over: Partial<PackageDeclaration>): PackageDeclaration {
    return { id: 'pkg', sourceRoot: 'pkg-src', destinationRoot: 'dest', ...over };
  }

  it('AC-052: an unreadable/non-existent source root is rejected, naming the package', () => {
    expect(() => validatePackages([decl({ sourceRoot: 'does-not-exist' })], t.root, [])).toThrow(
      PackageValidationError,
    );
    try {
      validatePackages([decl({ sourceRoot: 'does-not-exist' })], t.root, []);
    } catch (e) {
      expect((e as Error).message).toContain('pkg');
    }
  });

  it('AC-012/AC-045: a destination root outside the project root is rejected before deployment', () => {
    t.write('pkg-src/commands/foo.md', 'x');
    expect(() =>
      validatePackages([decl({ destinationRoot: '../outside' })], t.root, []),
    ).toThrow(PackageValidationError);
  });

  it('AC-014/AC-047: overlapping sibling package destinations are rejected, both ids named', () => {
    t.write('pkg-src/commands/foo.md', 'x');
    const pkgs = [
      decl({ id: 'one', destinationRoot: 'shared/dest' }),
      decl({ id: 'two', destinationRoot: 'shared/dest' }),
    ];
    try {
      validatePackages(pkgs, t.root, []);
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toContain('one');
      expect((e as Error).message).toContain('two');
    }
  });

  it('AC-014: a parent/child destination overlap between siblings is rejected', () => {
    t.write('pkg-src/commands/foo.md', 'x');
    const pkgs = [
      decl({ id: 'parent', destinationRoot: 'shared' }),
      decl({ id: 'child', destinationRoot: 'shared/nested' }),
    ];
    expect(() => validatePackages(pkgs, t.root, [])).toThrow(PackageValidationError);
  });

  it('AC-056: a destination overlapping a registered render target is rejected', () => {
    t.write('pkg-src/commands/foo.md', 'x');
    const renderTargetDirs = [t.p('.claude/commands')];
    expect(() =>
      validatePackages([decl({ destinationRoot: '.claude/commands' })], t.root, renderTargetDirs),
    ).toThrow(PackageValidationError);
  });

  it('FR-052: a package destinationRoot overlapping its own sourceRoot is rejected', () => {
    t.write('pkg-src/commands/foo.md', 'x');
    expect(() =>
      validatePackages([decl({ sourceRoot: 'pkg-src', destinationRoot: 'pkg-src' })], t.root, []),
    ).toThrow(PackageValidationError);
  });

  it('FR-052: a destinationRoot nested inside its own sourceRoot is rejected', () => {
    t.write('pkg-src/commands/foo.md', 'x');
    expect(() =>
      validatePackages(
        [decl({ sourceRoot: 'pkg-src', destinationRoot: 'pkg-src/nested' })],
        t.root,
        [],
      ),
    ).toThrow(PackageValidationError);
  });

  it('passes for a well-formed, isolated package declaration', () => {
    t.write('pkg-src/commands/foo.md', 'x');
    expect(() =>
      validatePackages([decl({ sourceRoot: 'pkg-src', destinationRoot: 'dest' })], t.root, [
        t.p('.claude/commands'),
      ]),
    ).not.toThrow();
  });
});

describe('resolveDeclaredPackage (T-002, FR-047/AC-055)', () => {
  it('throws UnknownPackageError naming the supplied id when no package matches', () => {
    expect(() => resolveDeclaredPackage([], 'ghost')).toThrow(UnknownPackageError);
    try {
      resolveDeclaredPackage([], 'ghost');
    } catch (e) {
      expect((e as UnknownPackageError).packageId).toBe('ghost');
    }
  });

  it('resolves a matching declared package', () => {
    const pkg: PackageDeclaration = { id: 'x', sourceRoot: 's', destinationRoot: 'd' };
    expect(resolveDeclaredPackage([pkg], 'x')).toBe(pkg);
  });
});
