import { runCli } from '../helpers/run-cli';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedApply, seedMandatoryWarnings } from '../helpers/seed-cli';
import { stripAnsi } from '../helpers/strip-ansi';

/**
 * T-014 (FR-009) and T-015 (FR-010): consistent severity prefixing. Every error
 * line begins with the exact prefix "error: " on the error stream; every warning
 * line begins with the token "warning" in the structured
 * `warning[<kind>] <artifact> <arrow> <target>: <message>` form.
 */
describe('consistent severity prefixing (T-014, T-015)', () => {
  let t: TempRoot;
  afterEach(() => t.cleanup());

  it('100% of error lines begin with the prefix "error: " on stderr (FR-009)', () => {
    t = makeTempRoot();
    seedApply(t);
    const r = runCli(t.root, ['apply', '--targets', 'ghost-tool']);
    expect(r.status).toBe(1);
    const errorLines = stripAnsi(r.stderr).split('\n').filter((l) => l.trim().length > 0);
    expect(errorLines.length).toBeGreaterThanOrEqual(1);
    for (const line of errorLines) {
      expect(line.startsWith('error: ')).toBe(true);
    }
  });

  it('100% of warning lines begin with the token "warning" in structured form (FR-010)', () => {
    t = makeTempRoot();
    seedMandatoryWarnings(t);
    const r = runCli(t.root, ['apply', '--dry-run']);
    const warningLines = stripAnsi(r.stdout)
      .split('\n')
      .filter((l) => l.includes('warning['));
    expect(warningLines.length).toBeGreaterThanOrEqual(2);
    for (const line of warningLines) {
      // Begins with the structured token warning[<kind>] …
      expect(line.trimStart()).toMatch(/^warning\[[a-z-]+\] .+: .+$/);
    }
  });
});
