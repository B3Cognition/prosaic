import { execFileSync } from 'child_process';
import { CLI_BIN } from '../helpers/run-cli';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedImportForeign } from '../helpers/seed-cli';
import { countEscapes } from '../helpers/strip-ansi';
import { REQUIRED_TOKENS } from '../helpers/tokens';

/**
 * T-005 (NFR-009): the compiled binary, run through execFileSync on a real
 * non-interactive pipe, passes 100% of end-to-end verbatim-token assertions. The
 * harness always sees a non-interactive stream, so correct TTY gating keeps the
 * output on the plain path (0 escape sequences) with the tokens intact.
 */
describe('shipped-binary verbatim-token e2e on a non-interactive pipe (T-005)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedImportForeign(t);
  });
  afterEach(() => t.cleanup());

  it('runs on a non-interactive pipe with every verbatim-token assertion passing', () => {
    // execFileSync pipes stdout — never a TTY — so this is the plain path.
    const stdout = execFileSync('node', [CLI_BIN, 'import', '--dry-run'], {
      cwd: t.root,
      encoding: 'utf8',
    });

    // 0 failing verbatim-token assertions: every required token present verbatim…
    for (const token of REQUIRED_TOKENS) {
      expect(stdout.includes(token)).toBe(true);
    }
    // …and the non-interactive pipe carries 0 escape sequences.
    expect(countEscapes(stdout)).toBe(0);
  });
});
