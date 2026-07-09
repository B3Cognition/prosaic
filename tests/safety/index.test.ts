import * as fs from 'fs';
import { GuardedFs } from '../../src/write/guarded-fs';
import { Manifest } from '../../src/manifest/manifest';
import { executeRevert, planRevert } from '../../src/lifecycle/revert';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

/**
 * Consolidated safety gate over a real temporary filesystem (T-005). The
 * containment, symlink, backup-retention, and manifest suites run in their own
 * files; this file pins the cross-cutting invariant that a deletion never
 * proceeds without a manifest record (FR-035).
 */
describe('safety gate: deletion requires a manifest record (T-005, FR-035)', () => {
  let t: TempRoot;
  let gfs: GuardedFs;
  beforeEach(() => {
    t = makeTempRoot();
    gfs = new GuardedFs(t.root);
  });
  afterEach(() => t.cleanup());

  it('revert deletes only manifest-recorded files; unrecorded files survive', () => {
    // Two files on disk; only one is recorded as tool-generated.
    t.write('.out/managed.md', 'generated');
    t.write('.out/handwritten.md', 'mine');

    const m = Manifest.empty(gfs, '1.0.0');
    m.record('t', '.out/managed.md', 'h');
    m.save();

    const plan = planRevert(Manifest.load(gfs), 'all');
    const removed = executeRevert(plan, gfs, Manifest.load(gfs));

    expect(removed).toBe(1);
    expect(fs.existsSync(t.p('.out/managed.md'))).toBe(false);
    expect(fs.existsSync(t.p('.out/handwritten.md'))).toBe(true);
  });

  it('the safety suite runs over a real temp filesystem, not a mock', () => {
    expect(fs.existsSync(t.root)).toBe(true);
    expect(fs.statSync(t.root).isDirectory()).toBe(true);
  });
});
