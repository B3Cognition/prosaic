import { deployPackage } from '../../../src/package/run';
import { Manifest } from '../../../src/manifest/manifest';
import { GuardedFs } from '../../../src/write/guarded-fs';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

function seedFixturePackage(t: TempRoot): void {
  t.write('pkg/commands/deploy.md', '---\ndescription: deploy\n---\nRun.\n');
  t.write('pkg/commands/deploy.companion.txt', 'companion');
  t.write('pkg/subagents/helper/AGENT.md', '---\nname: helper\n---\nHelp.\n');
  t.write('pkg/scripts/build.sh', '#!/bin/sh\necho hi\n');
  t.write('pkg/templates/nested/tpl.txt', 'template body');
  t.write(
    'prosaic.config.yaml',
    'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
  );
}

describe('package round-trip: plan -> stage -> commit -> manifest (T-014, FR-016/FR-019/FR-020, NFR-004/NFR-009)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedFixturePackage(t);
  });
  afterEach(() => t.cleanup());

  it('AC-002: a full round-trip deploy produces the expected manifest entries', () => {
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    const fsGate = new GuardedFs(t.root);
    const manifest = Manifest.load(fsGate);
    const entries = manifest.forTarget('my-pkg').map((e) => e.path).sort();
    expect(entries).toEqual([
      'dest/commands/deploy.companion.txt',
      'dest/commands/deploy.md',
      'dest/scripts/build.sh',
      'dest/subagents/helper/AGENT.md',
      'dest/templates/nested/tpl.txt',
    ]);
  });

  it('NFR-004: 2 consecutive unchanged re-runs produce 0 diffs', () => {
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    const contentAfterFirst = t.read('dest/commands/deploy.md');

    const second = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    expect(second.created).toBe(0);
    expect(second.overwritten).toBe(0);
    expect(second.removed).toBe(0);

    const third = deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    expect(third.created).toBe(0);
    expect(third.overwritten).toBe(0);
    expect(third.removed).toBe(0);

    expect(t.read('dest/commands/deploy.md')).toBe(contentAfterFirst);
  });

  it('NFR-009: provenance lookup resolves package ownership from the manifest alone', () => {
    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });
    const fsGate = new GuardedFs(t.root);
    const manifest = Manifest.load(fsGate);
    for (const relPath of [
      'dest/commands/deploy.md',
      'dest/scripts/build.sh',
      'dest/templates/nested/tpl.txt',
    ]) {
      expect(manifest.isManaged('my-pkg', relPath)).toBe(true);
    }
  });
});
