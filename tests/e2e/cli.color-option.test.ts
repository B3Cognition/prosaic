import { runCli } from '../helpers/run-cli';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedApply } from '../helpers/seed-cli';
import { countEscapes } from '../helpers/strip-ansi';

/**
 * T-012 (FR-019): the color option is declared under the strict parser, so the
 * binary accepts `--color` and `--no-color`, exiting 0 rather than rejecting an
 * unknown argument.
 */
describe('declared color option under the strict parser (T-012)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedApply(t);
  });
  afterEach(() => t.cleanup());

  it('the binary invoked with --no-color exits 0', () => {
    const r = runCli(t.root, ['apply', '--dry-run', '--no-color']);
    expect(r.status).toBe(0);
    expect(countEscapes(r.stdout)).toBe(0);
  });

  it('the binary invoked with --color exits 0', () => {
    const r = runCli(t.root, ['apply', '--dry-run', '--color']);
    expect(r.status).toBe(0);
    // --color forces styling even though stdout is a pipe.
    expect(countEscapes(r.stdout)).toBeGreaterThanOrEqual(1);
  });
});
