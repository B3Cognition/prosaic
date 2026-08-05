import * as fs from 'fs';
import { deployPackage } from '../../../src/package/run';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

const isPosix = process.platform !== 'win32';
const describePosix = isPosix ? describe : describe.skip;

describe('package runtime-tree mode preservation (T-021, FR-013, Should-Have)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  describePosix('on a POSIX host', () => {
    it('AC-003: an executable Package Runtime Tree file keeps its permission bits exactly', () => {
      const scriptAbs = t.write('pkg/scripts/run.sh', '#!/bin/sh\necho hi\n');
      fs.chmodSync(scriptAbs, 0o755);
      t.write('pkg/commands/deploy.md', 'x');
      t.write(
        'prosaic.config.yaml',
        'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
      );

      deployPackage({ projectRoot: t.root, packageId: 'my-pkg' });

      const sourceMode = fs.statSync(scriptAbs).mode & 0o777;
      const destMode = fs.statSync(t.p('dest/scripts/run.sh')).mode & 0o777;
      expect(destMode).toBe(sourceMode);
      expect(destMode).toBe(0o755);
    });

    it('does not attempt to preserve mode for Neutral Artifact Tree files', () => {
      const cmdAbs = t.write('pkg/commands/deploy.md', 'x');
      fs.chmodSync(cmdAbs, 0o600);
      t.write(
        'prosaic.config.yaml',
        'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
      );
      // Should not throw even though the neutral file's mode is never copied.
      expect(() => deployPackage({ projectRoot: t.root, packageId: 'my-pkg' })).not.toThrow();
      expect(fs.existsSync(t.p('dest/commands/deploy.md'))).toBe(true);
    });
  });
});
