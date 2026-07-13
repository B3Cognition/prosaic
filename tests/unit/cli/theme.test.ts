import { plainTheme, styledTheme, themeFor, Theme } from '../../../src/cli/theme';
import { stripAnsi, countEscapes, isAscii } from '../../helpers/strip-ansi';
import { REQUIRED_TOKENS, FIDELITY_LABELS } from '../../helpers/tokens';

/**
 * T-013 (INFRA): the injected theme seam. Substring invariance is the correctness
 * firewall — stripping ANSI from any styled wrapper output returns the input, and
 * the plain theme is exact identity. Each styled outcome wrapper emits one unique
 * color code.
 */
describe('injected theme seam (T-013)', () => {
  const corpus = [...REQUIRED_TOKENS, ...FIDELITY_LABELS, 'nothing is lost', '100% lossless', ''];
  const colorWrappers = (t: Theme) => [t.created, t.overwrite, t.error, t.unchanged, t.path, t.warn, t.errorPrefix, t.dim];

  it('stripAnsi of any styled wrapper output equals the input string', () => {
    for (const wrap of colorWrappers(styledTheme)) {
      for (const s of corpus) {
        expect(stripAnsi(wrap(s))).toBe(s);
      }
    }
  });

  it('plainTheme wrappers are exact identity, holding zero escapes', () => {
    for (const wrap of colorWrappers(plainTheme)) {
      for (const s of corpus) {
        expect(wrap(s)).toBe(s);
        expect(countEscapes(wrap(s))).toBe(0);
      }
    }
  });

  it('each styled outcome wrapper emits one unique color code', () => {
    const outcomeWrappers = [styledTheme.created, styledTheme.overwrite, styledTheme.error, styledTheme.unchanged];
    const codes = outcomeWrappers.map((w) => w('x').match(/\x1b\[(\d+)m/)![1]);
    expect(new Set(codes).size).toBe(codes.length);
    // The path style is disjoint from every outcome-state color (FR-025).
    const pathCode = styledTheme.path('x').match(/\x1b\[(\d+)m/)![1];
    expect(codes).not.toContain(pathCode);
  });

  it('plain-theme markers and arrow are pure ASCII (NFR-007)', () => {
    expect(isAscii(plainTheme.okMarker)).toBe(true);
    expect(isAscii(plainTheme.dropMarker)).toBe(true);
    expect(isAscii(plainTheme.arrow)).toBe(true);
  });

  it('themeFor maps mode to theme', () => {
    expect(themeFor('styled')).toBe(styledTheme);
    expect(themeFor('plain')).toBe(plainTheme);
  });
});
