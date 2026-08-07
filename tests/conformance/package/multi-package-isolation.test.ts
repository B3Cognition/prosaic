import * as fs from 'fs';
import { deployPackage } from '../../../src/package/run';
import { Manifest } from '../../../src/manifest/manifest';
import { GuardedFs } from '../../../src/write/guarded-fs';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('multiple independently declared packages within one project (T-023, FR-044, Could-Ship)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  function seed(): void {
    t.write('pkg-alpha/commands/a.md', 'alpha-a');
    t.write('pkg-alpha/scripts/a.sh', 'alpha-script');
    t.write('pkg-beta/commands/b.md', 'beta-b');
    t.write('pkg-beta/subagents/helper/AGENT.md', 'beta-agent');
    t.write(
      'prosaic.config.yaml',
      'packages:\n' +
        '  - id: alpha\n    sourceRoot: pkg-alpha\n    destinationRoot: dest-alpha\n' +
        '  - id: beta\n    sourceRoot: pkg-beta\n    destinationRoot: dest-beta\n',
    );
  }

  it('AC-018: deploys and reconciles each package independently with 0 cross-package interference', () => {
    seed();
    const alphaReport = deployPackage({ projectRoot: t.root, packageId: 'alpha' });
    const betaReport = deployPackage({ projectRoot: t.root, packageId: 'beta' });

    expect(alphaReport.created).toBe(2);
    expect(betaReport.created).toBe(2);
    expect(t.exists('dest-alpha/commands/a.md')).toBe(true);
    expect(t.exists('dest-beta/commands/b.md')).toBe(true);

    // Redeploying alpha after removing one of its files never touches beta's output.
    fs.rmSync(t.p('pkg-alpha/scripts/a.sh'));
    const alphaRedeploy = deployPackage({ projectRoot: t.root, packageId: 'alpha' });
    expect(alphaRedeploy.removed).toBe(1);
    expect(t.exists('dest-alpha/scripts/a.sh')).toBe(false);
    expect(t.exists('dest-beta/commands/b.md')).toBe(true);
    expect(t.exists('dest-beta/subagents/helper/AGENT.md')).toBe(true);
  });

  it('AC-027/AC-041: provenance identifiers show 0 collisions across the two packages', () => {
    seed();
    deployPackage({ projectRoot: t.root, packageId: 'alpha' });
    deployPackage({ projectRoot: t.root, packageId: 'beta' });

    const fsGate = new GuardedFs(t.root);
    const manifest = Manifest.load(fsGate);
    const alphaPaths = new Set(manifest.forTarget('alpha').map((e) => e.path));
    const betaPaths = new Set(manifest.forTarget('beta').map((e) => e.path));

    for (const p of alphaPaths) expect(betaPaths.has(p)).toBe(false);
    expect(alphaPaths.size).toBe(2);
    expect(betaPaths.size).toBe(2);
  });
});
