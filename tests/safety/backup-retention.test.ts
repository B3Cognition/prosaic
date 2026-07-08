import { GuardedFs } from '../../src/write/guarded-fs';
import { BackupManager } from '../../src/write/backup';
import { isBackupPath } from '../../src/write/backup-location';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

describe('BackupManager (T-003, FR-025/FR-049/FR-055)', () => {
  let t: TempRoot;
  let gfs: GuardedFs;

  beforeEach(() => {
    t = makeTempRoot();
    gfs = new GuardedFs(t.root);
  });
  afterEach(() => t.cleanup());

  it('NFR-002: a backup captures prior content before overwrite', () => {
    const abs = t.write('out/foo.md', 'v1');
    const backups = new BackupManager(gfs);
    const backupPath = backups.backup(abs);
    expect(gfs.readFile(backupPath)).toBe('v1');
  });

  it('AC-033: at most 3 backups retained; oldest pruned', () => {
    const abs = t.write('out/foo.md', 'v0');
    const backups = new BackupManager(gfs);

    for (let i = 1; i <= 4; i++) {
      // Simulate a content-changing overwrite: back up, then change content.
      backups.backup(abs);
      require('fs').writeFileSync(abs, `v${i}`);
    }

    const kept = backups.listBackups(abs);
    expect(kept.length).toBe(3);
    // Oldest (seq 1) pruned; the retained sequences are the 3 newest.
    expect(kept.map((b) => b.seq)).toEqual([2, 3, 4]);
  });

  it('AC-033: backup location resolves inside the root and is discovery-excluded', () => {
    const abs = t.write('out/foo.md', 'v1');
    const backups = new BackupManager(gfs);
    const backupPath = backups.backup(abs);
    expect(gfs.contains(backupPath)).toBe(true);
    expect(isBackupPath(backupPath, t.root)).toBe(true);
  });
});
