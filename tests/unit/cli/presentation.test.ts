import { resolvePresentation } from '../../../src/cli/presentation';

/**
 * T-011 (FR-002..FR-005, FR-020, FR-021, NFR-003): the per-stream presentation
 * resolver, exercised across all seven precedence steps plus boundary cases.
 */
describe('per-stream presentation resolver (T-011)', () => {
  const noEnv: NodeJS.ProcessEnv = {};

  it('a non-interactive stream yields plain', () => {
    expect(resolvePresentation({ isTTY: false, env: noEnv })).toBe('plain');
  });

  it('an interactive stream yields styled', () => {
    expect(resolvePresentation({ isTTY: true, env: noEnv })).toBe('styled');
  });

  it('NO_COLOR present yields plain regardless of interactivity', () => {
    expect(resolvePresentation({ isTTY: true, env: { NO_COLOR: '1' } })).toBe('plain');
    expect(resolvePresentation({ isTTY: false, env: { NO_COLOR: '' } })).toBe('plain');
  });

  it('FORCE_COLOR set to "0" yields plain', () => {
    expect(resolvePresentation({ isTTY: true, env: { FORCE_COLOR: '0' } })).toBe('plain');
  });

  it('FORCE_COLOR set to another value yields styled on a non-interactive stream', () => {
    expect(resolvePresentation({ isTTY: false, env: { FORCE_COLOR: '1' } })).toBe('styled');
    expect(resolvePresentation({ isTTY: false, env: { FORCE_COLOR: 'true' } })).toBe('styled');
  });

  it('NO_COLOR with FORCE_COLOR both set yields plain, NO_COLOR winning (FR-021)', () => {
    expect(resolvePresentation({ isTTY: false, env: { NO_COLOR: '1', FORCE_COLOR: '1' } })).toBe('plain');
  });

  it('the --no-color flag overrides everything to plain', () => {
    expect(
      resolvePresentation({ isTTY: true, env: { FORCE_COLOR: '1' }, colorFlag: false }),
    ).toBe('plain');
  });

  it('the --color flag overrides everything to styled', () => {
    expect(
      resolvePresentation({ isTTY: false, env: { NO_COLOR: '1' }, colorFlag: true }),
    ).toBe('styled');
  });

  it('undefined isTTY resolves to plain without throwing', () => {
    expect(() => resolvePresentation({ env: noEnv })).not.toThrow();
    expect(resolvePresentation({ env: noEnv })).toBe('plain');
    expect(resolvePresentation({ isTTY: undefined, env: noEnv })).toBe('plain');
  });
});
