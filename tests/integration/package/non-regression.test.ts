import * as fs from 'fs';
import * as path from 'path';
import { apply } from '../../../src/lifecycle/run';
import { Registry, StaticRegistrySource } from '../../../src/registry/registry';
import { makeDescriptor } from '../../helpers/descriptor-factory';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

function testRegistry(): Registry {
  return new Registry(
    new StaticRegistrySource([
      makeDescriptor({ id: 'alpha', destinationDir: '.shared/rules', extension: '.md' }),
    ]),
  );
}

function seedSource(t: TempRoot): void {
  t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');
}

describe('non-regression: existing render commands unaffected by package declarations (T-012, FR-014/FR-030..FR-032/FR-049..FR-051, NFR-001)', () => {
  it('AC-020/AC-032/AC-049: apply output is byte-identical with 0 vs. >=1 declared packages', () => {
    const withoutPackages = makeTempRoot();
    const withPackages = makeTempRoot();
    try {
      seedSource(withoutPackages);
      seedSource(withPackages);
      withPackages.write('pkg/commands/other.md', 'x');
      withPackages.write(
        'prosaic.config.yaml',
        'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: pkg-dest\n',
      );

      const r1 = apply({ projectRoot: withoutPackages.root, registry: testRegistry() });
      const r2 = apply({ projectRoot: withPackages.root, registry: testRegistry() });

      expect(r1.created).toBe(r2.created);
      expect(withoutPackages.read('.shared/rules/style.md')).toBe(
        withPackages.read('.shared/rules/style.md'),
      );
    } finally {
      withoutPackages.cleanup();
      withPackages.cleanup();
    }
  });

  it('AC-017: render pipeline output for an unrelated artifact has 0 differing bytes', () => {
    const t = makeTempRoot();
    try {
      seedSource(t);
      const before = apply({ projectRoot: t.root, registry: testRegistry() });
      const beforeContent = t.read('.shared/rules/style.md');

      t.write('pkg/commands/other.md', 'x');
      t.write(
        'prosaic.config.yaml',
        'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: pkg-dest\n',
      );
      const after = apply({ projectRoot: t.root, registry: testRegistry() });

      expect(before.created).toBe(after.unchanged + after.created);
      expect(t.read('.shared/rules/style.md')).toBe(beforeContent);
    } finally {
      t.cleanup();
    }
  });

  it('FR-048/AC-058/FR-050/AC-059/FR-051/AC-048/AC-060: 0 hardcoded application/MCP/SDD references in src/package/**', () => {
    const pkgDir = path.join(__dirname, '..', '..', '..', 'src', 'package');
    const forbidden = [
      /echelon/i,
      /model[- ]context[- ]protocol/i,
      /\bmcp\b/i,
      /spec-?kit/i,
      /speckit/i,
    ];
    const files = fs.readdirSync(pkgDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = fs.readFileSync(path.join(pkgDir, file), 'utf8');
      for (const pattern of forbidden) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
