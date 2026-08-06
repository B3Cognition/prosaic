import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { deployPackage } from '../../../src/package/run';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

/** SHA-256 hash of every file under `dir`, keyed by its path relative to `dir`. */
function hashTree(dir: string): Map<string, string> {
  const hashes = new Map<string, string>();

  function walk(current: string, relPrefix: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(current, entry.name);
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile()) {
        hashes.set(rel, crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'));
      }
    }
  }

  walk(dir, '');
  return hashes;
}

describe('contract: package source tree is byte-identical before vs. after deployment (AC-061, FR-052)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('AC-061/FR-052: a SHA-256 hash comparison of the source tree before vs. after deployment is identical for 100% of its files', () => {
    t.write('pkg/commands/deploy.md', '---\ndescription: deploy\n---\nRun.\n');
    t.write('pkg/subagents/helper/AGENT.md', '---\nname: helper\n---\nHelp.\n');
    t.write('pkg/scripts/build.sh', '#!/bin/sh\necho hi\n');
    t.write('pkg/assets/image.bin', Buffer.from([0, 1, 2, 255, 254, 253]).toString('binary'));
    t.write(
      'prosaic.config.yaml',
      'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
    );

    const before = hashTree(t.p('pkg'));
    expect(before.size).toBeGreaterThan(0);

    deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });

    const after = hashTree(t.p('pkg'));
    expect(after.size).toBe(before.size);
    for (const [rel, hash] of before) {
      expect(after.get(rel)).toBe(hash);
    }
  });
});
