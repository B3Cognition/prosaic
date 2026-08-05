import * as crypto from 'crypto';
import * as fs from 'fs';
import { deployPackage } from '../../../src/package/run';
import { enumeratePackageSource } from '../../../src/package/enumerate';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

function sha256File(t: TempRoot, rel: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(t.p(rel))).digest('hex');
}

describe('contract: SHA-256 byte-identity of deployed files against source (T-031, FR-006/FR-010)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('AC-001/AC-022: every deployed file hashes identically to its source counterpart', () => {
    t.write('pkg/commands/deploy.md', '---\ndescription: deploy\n---\nRun.\n');
    t.write('pkg/subagents/helper/AGENT.md', '---\nname: helper\n---\nHelp.\n');
    t.write('pkg/scripts/build.sh', '#!/bin/sh\necho hi\n');
    t.write('pkg/assets/image.bin', Buffer.from([0, 1, 2, 255, 254, 253]).toString('binary'));
    t.write(
      'prosaic.config.yaml',
      'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
    );

    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });

    const enumerated = enumeratePackageSource(t.p('pkg'));
    const allFiles = [...enumerated.neutralFiles, ...enumerated.runtimeFiles];
    expect(allFiles.length).toBeGreaterThan(0);
    for (const file of allFiles) {
      const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(file.absPath)).digest('hex');
      const destHash = sha256File(t, `dest/${file.relPath}`);
      expect(destHash).toBe(sourceHash);
    }
  });
});
