import { walkSource } from '../../../src/discovery/walk';
import { discover } from '../../../src/discovery/discover';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('.prosaic-package-staging exclusion (T-004, FR-012/FR-041, AC-015/AC-025)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('walkSource never yields a path under .prosaic-package-staging/', () => {
    t.write('.prosaic/commands/deploy.md', '---\ndescription: deploy\n---\nRun {{args}}.\n');
    t.write('.prosaic-package-staging/my-pkg/commands/other.md', '---\ndescription: x\n---\nBody.\n');
    const files = walkSource(t.p('.prosaic'), t.root);
    expect(files.some((f) => f.rel.includes('prosaic-package-staging'))).toBe(false);

    const rootFiles = walkSource(t.root, t.root);
    expect(rootFiles.every((f) => !f.abs.includes('.prosaic-package-staging'))).toBe(true);
  });

  it('discover() never classifies content under .prosaic-package-staging/ as an artifact', () => {
    t.write('.prosaic-package-staging/my-pkg/commands/other.md', '---\ndescription: x\n---\nBody.\n');
    const result = discover(t.root, t.root);
    expect(result.artifacts.every((a) => !a.sourcePath.includes('.prosaic-package-staging'))).toBe(
      true,
    );
  });
});
