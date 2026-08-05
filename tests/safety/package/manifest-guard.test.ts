import { deployPackage } from '../../../src/package/run';
import { ManifestError } from '../../../src/manifest/manifest';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

function seed(t: TempRoot): void {
  t.write('pkg/commands/deploy.md', 'x');
  t.write(
    'prosaic.config.yaml',
    'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
  );
}

describe('package safety: corrupt/absent manifest aborts a Provenance-Guarded Operation (T-013, FR-024, AC-010/AC-042)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seed(t);
  });
  afterEach(() => t.cleanup());

  it('AC-010/AC-042: a corrupt manifest aborts deployment with 0 files removed/written', () => {
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    t.write('.prosaic-manifest.json', '{corrupt');
    expect(() => deployPackage({ projectRoot: t.root, packageId: 'my-pkg' })).toThrow(
      ManifestError,
    );
    // Destination content from the first successful deploy is untouched.
    expect(t.read('dest/commands/deploy.md')).toBe('x');
  });

  it('an absent manifest is treated as a first-ever deployment, not an abort', () => {
    expect(() => deployPackage({ projectRoot: t.root, packageId: 'my-pkg' })).not.toThrow();
    expect(t.exists('dest/commands/deploy.md')).toBe(true);
  });
});
