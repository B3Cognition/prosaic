import * as fs from 'fs';
import { deployPackage } from '../../../src/package/run';
import { generateFixturePackage } from '../../helpers/package-fixture';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('conformance: 500-file-scale reconcile touches 0 foreign paths (T-028, NFR-007)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('a 500-file-scale reconcile touches 0 foreign paths', () => {
    generateFixturePackage(t, 'pkg', 500);
    t.write('dest/foreign/keep-me.txt', 'not managed by this package');
    t.write(
      'prosaic.config.yaml',
      'packages:\n  - id: scale-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
    );

    deployPackage({ projectRoot: t.root, packageId: 'scale-pkg' });
    expect(t.read('dest/foreign/keep-me.txt')).toBe('not managed by this package');

    fs.rmSync(t.p('pkg'), { recursive: true, force: true });
    fs.mkdirSync(t.p('pkg'), { recursive: true });

    const report = deployPackage({ projectRoot: t.root, packageId: 'scale-pkg' });
    expect(report.removed).toBe(500);
    expect(t.exists('dest/foreign/keep-me.txt')).toBe(true);
    expect(t.read('dest/foreign/keep-me.txt')).toBe('not managed by this package');
  });
});
