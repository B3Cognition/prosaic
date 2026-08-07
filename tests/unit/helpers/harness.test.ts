import { runCli } from '../../helpers/run-cli';
import {
  ANSI_SGR,
  stripAnsi,
  countEscapes,
  countSGR,
  isAscii,
  countNonAscii,
} from '../../helpers/strip-ansi';
import { captureStreams } from '../../helpers/capture-streams';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

// A known styled sample (green "ok" + underlined path) and its plain twin.
const STYLED = '\x1b[32mok\x1b[0m \x1b[4mpath\x1b[0m';
const PLAIN = 'ok path';

describe('foundation harness helpers (T-001)', () => {
  it('the escape regex lives in exactly one module and strips cleanly', () => {
    expect(ANSI_SGR).toBeInstanceOf(RegExp);
    expect(stripAnsi(STYLED)).toBe(PLAIN);
    expect(stripAnsi(PLAIN)).toBe(PLAIN); // plain sample is untouched
  });

  it('countEscapes / countSGR count each SGR sequence on the styled sample', () => {
    // Two opening codes + two resets = 4 sequences.
    expect(countEscapes(STYLED)).toBe(4);
    expect(countSGR(STYLED)).toBe(4);
    expect(countEscapes(PLAIN)).toBe(0);
  });

  it('isAscii / countNonAscii measure non-ASCII bytes', () => {
    expect(isAscii(PLAIN)).toBe(true);
    expect(isAscii('✓ path')).toBe(false);
    expect(countNonAscii('✓✗→')).toBe(3);
    expect(countNonAscii(PLAIN)).toBe(0);
  });

  it('captureStreams separates stdout from stderr', () => {
    const cap = captureStreams(() => {
      process.stdout.write('to-out');
      process.stderr.write('to-err');
    });
    expect(cap.stdout).toBe('to-out');
    expect(cap.stderr).toBe('to-err');
  });

  describe('runCli returns stdout, stderr, status as three separate fields', () => {
    let t: TempRoot;
    beforeEach(() => (t = makeTempRoot()));
    afterEach(() => t.cleanup());

    it('separates the three fields and accepts a per-case env override', () => {
      const r = runCli(t.root, ['--version'], { NO_COLOR: '1' });
      expect(typeof r.stdout).toBe('string');
      expect(typeof r.stderr).toBe('string');
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/\d+\.\d+\.\d+/);
      // stderr is its own field, not concatenated into stdout.
      expect(r.stderr).not.toContain(r.stdout.trim());
    });
  });
});
