import { resolvePresentation, PresentationMode } from '../../../src/cli/presentation';
import { themeFor } from '../../../src/cli/theme';
import { runCli } from '../../helpers/run-cli';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';
import { seedImportForeign, seedMandatoryWarnings } from '../../helpers/seed-cli';
import { countEscapes } from '../../helpers/strip-ansi';

/**
 * T-011 / T-016: the per-stream escape-count matrix. Interactivity crossed with
 * env resolves per stream, and each stream is themed independently so exactly one
 * of two mixed-interactivity streams carries ANSI (FR-005). The shipped-binary
 * checks confirm the wiring preserves stream assignment (A-005).
 */
describe('per-stream presentation matrix (T-011, T-016)', () => {
  /** Render a themed sample for a mode and count its escape sequences. */
  function escapesFor(mode: PresentationMode): number {
    const theme = themeFor(mode);
    return countEscapes(theme.created('created') + theme.path('/p') + theme.warn('warning'));
  }

  const MATRIX: Array<{ isTTY?: boolean; env: NodeJS.ProcessEnv; expect: PresentationMode }> = [
    { isTTY: true, env: {}, expect: 'styled' },
    { isTTY: false, env: {}, expect: 'plain' },
    { isTTY: undefined, env: {}, expect: 'plain' },
    { isTTY: true, env: { NO_COLOR: '1' }, expect: 'plain' },
    { isTTY: false, env: { FORCE_COLOR: '1' }, expect: 'styled' },
    { isTTY: true, env: { FORCE_COLOR: '0' }, expect: 'plain' },
    { isTTY: true, env: { NO_COLOR: '1', FORCE_COLOR: '1' }, expect: 'plain' },
  ];

  it('every interactivity × env cell resolves to the expected mode and escape count', () => {
    for (const cell of MATRIX) {
      const mode = resolvePresentation({ isTTY: cell.isTTY, env: cell.env });
      expect(mode).toBe(cell.expect);
      // A plain stream holds zero escapes; a styled stream holds at least one.
      if (mode === 'plain') expect(escapesFor(mode)).toBe(0);
      else expect(escapesFor(mode)).toBeGreaterThanOrEqual(1);
    }
  });

  it('exactly one of two mixed-interactivity streams carries ANSI (FR-005)', () => {
    const stdout = resolvePresentation({ isTTY: true, env: {} });
    const stderr = resolvePresentation({ isTTY: false, env: {} });
    const styledCount = [stdout, stderr].filter((m) => m === 'styled').length;
    expect(styledCount).toBe(1);
  });

  describe('shipped-binary stream assignment and per-stream SGR (T-016)', () => {
    let t: TempRoot;
    afterEach(() => t.cleanup());

    it('an interactive-style stream carries at least one SGR; the plain path stays escape-free', () => {
      t = makeTempRoot();
      seedImportForeign(t);
      const styled = runCli(t.root, ['import', '--dry-run'], { FORCE_COLOR: '1' });
      expect(countEscapes(styled.stdout)).toBeGreaterThanOrEqual(1);

      const plain = runCli(t.root, ['import', '--dry-run'], { NO_COLOR: '1' });
      expect(countEscapes(plain.stdout)).toBe(0);
      expect(countEscapes(plain.stderr)).toBe(0);
    });

    it('apply warns on stdout only, import surfaces warnings on stderr (A-005, FR-016)', () => {
      t = makeTempRoot();
      seedMandatoryWarnings(t);
      // Apply surfaces its warnings on stdout and leaves stderr clean (A-005).
      const ap = runCli(t.root, ['apply', '--dry-run']);
      expect(ap.stdout).toContain('warning[');
      expect(ap.stderr).not.toContain('warning[');
      t.cleanup();

      // Import surfaces its run-level warnings on stderr (A-005).
      t = makeTempRoot();
      const im = runCli(t.root, ['import', '--dry-run', '--format', 'not-a-real-target']);
      expect(im.stderr).toContain('warning[');
    });
  });
});
