import { invertArgs, CANONICAL_NEUTRAL_PLACEHOLDER } from '../../../../src/import/neutralize/invert-args';
import { DEFAULT_PLACEHOLDERS } from '../../../../src/pipeline/stages/stage3-args';

describe('invertArgs (T-010, FR-017, FR-059, FR-060, FR-084)', () => {
  it('converts $ARGUMENTS to canonical neutral placeholder (FR-059)', () => {
    const { body } = invertArgs('Run $ARGUMENTS now', '$ARGUMENTS', 'cmd.md');
    expect(body).toBe(`Run ${CANONICAL_NEUTRAL_PLACEHOLDER} now`);
    expect(body).not.toContain('$ARGUMENTS');
  });

  it('converts {{args}} to canonical neutral placeholder', () => {
    const { body } = invertArgs('Use {{args}} here', '{{args}}', 'cmd.md');
    expect(body).toBe(`Use ${CANONICAL_NEUTRAL_PLACEHOLDER} here`);
  });

  it('converts all 4 default placeholder tokens', () => {
    for (const token of DEFAULT_PLACEHOLDERS) {
      const { body } = invertArgs(`Body with ${token} token`, token, 'cmd.md');
      expect(body).toContain(CANONICAL_NEUTRAL_PLACEHOLDER);
      expect(body).not.toContain(token === CANONICAL_NEUTRAL_PLACEHOLDER ? 'NEVER' : token);
    }
  });

  it('leaves 0 target argument tokens in the neutral body (FR-084)', () => {
    const { body } = invertArgs(
      '$ARGUMENTS $ARGUMENTS $ARGUMENTS',
      '$ARGUMENTS',
      'cmd.md',
    );
    expect(body).not.toContain('$ARGUMENTS');
    expect(body.split(CANONICAL_NEUTRAL_PLACEHOLDER).length - 1).toBe(3);
  });

  it('records the placeholder choice for non-standard tokens (FR-060)', () => {
    const { defaultedChoices, warnings } = invertArgs(
      'Run {{args_custom}} now',
      '{{args_custom}}',
      'cmd.md',
    );
    expect(defaultedChoices.length).toBeGreaterThanOrEqual(1);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].kind).toBe('defaulted-choice');
  });

  it('is a no-op when body contains no argument token', () => {
    const body = 'No args here at all';
    const { body: out, warnings } = invertArgs(body, '$ARGUMENTS', 'cmd.md');
    expect(out).toBe(body);
    expect(warnings).toHaveLength(0);
  });
});
