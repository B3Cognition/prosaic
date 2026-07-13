import * as fs from 'fs';
import * as path from 'path';
import { runCli } from '../helpers/run-cli';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedApply } from '../helpers/seed-cli';

/**
 * T-007 (FR-017, FR-018, FR-030): exit-code + dry-run no-write baseline. These
 * guard the no-functional-regression contract as styling lands.
 */
describe('exit-code + dry-run no-write baseline (T-007)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedApply(t);
  });
  afterEach(() => t.cleanup());

  it('the success path exits 0 (FR-017)', () => {
    const r = runCli(t.root, ['apply']);
    expect(r.status).toBe(0);
  });

  it('the caught-error path exits 1 (FR-030)', () => {
    // An unknown target is a caught error, not a crash: exit exactly 1.
    const r = runCli(t.root, ['apply', '--targets', 'ghost-tool']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('error: ');
  });

  it('the dry-run path writes zero files (FR-018)', () => {
    const before = countFiles(t.root);
    const r = runCli(t.root, ['apply', '--dry-run']);
    expect(r.status).toBe(0);
    // No distributed artifacts were written…
    expect(t.exists('.claude/commands/deploy.md')).toBe(false);
    expect(t.exists('.cursor/rules/style.mdc')).toBe(false);
    // …and the overall file count is unchanged.
    expect(countFiles(t.root)).toBe(before);
  });
});

/** Count every regular file under a root (recursively). */
function countFiles(root: string): number {
  let n = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) n += countFiles(abs);
    else n += 1;
  }
  return n;
}
