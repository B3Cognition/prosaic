import { wrap, green, yellow, red, gray, dim, underline } from '../../../src/cli/style';
import { stripAnsi, countSGR } from '../../helpers/strip-ansi';

/**
 * T-010 (FR-001, NFR-001): the zero-dependency ANSI helper emits exactly one
 * opening SGR plus one reset per wrapper and never alters the wrapped string.
 */
describe('zero-dependency ANSI SGR helper (T-010)', () => {
  const wrappers = { green, yellow, red, gray, dim, underline };

  it('wrap emits exactly one opening SGR plus one reset', () => {
    const out = wrap(32, 'hello');
    // Two SGR sequences total: the opening code and the reset.
    expect(countSGR(out)).toBe(2);
    expect(out.startsWith('\x1b[32m')).toBe(true);
    expect(out.endsWith('\x1b[0m')).toBe(true);
  });

  it('every color wrapper emits one opening SGR plus one reset', () => {
    for (const [name, fn] of Object.entries(wrappers)) {
      const out = fn('x');
      expect(countSGR(out)).toBe(2);
      expect(name).toBeTruthy();
    }
  });

  it('wrap never alters the wrapped string', () => {
    const samples = ['', 'auto-detected', 'a → b', 'lossless-where-invertible'];
    for (const s of samples) {
      for (const fn of Object.values(wrappers)) {
        expect(stripAnsi(fn(s))).toBe(s);
      }
    }
  });

  it('the color wrappers use distinct opening codes', () => {
    const codes = Object.values(wrappers).map((fn) => fn('x').match(/\x1b\[(\d+)m/)![1]);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
