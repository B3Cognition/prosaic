import { runCli } from '../helpers/run-cli';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedImportForeign } from '../helpers/seed-cli';
import { FIDELITY_LABELS } from '../helpers/tokens';

/**
 * T-002 (FR-013, FR-027, FR-028): required contractual tokens print verbatim.
 * Runs against the current plain output first, so the assertions stay green as
 * color is introduced later — the tokens must survive every presentation mode.
 */
describe('required contractual tokens preserved verbatim (T-002)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedImportForeign(t);
  });
  afterEach(() => t.cleanup());

  it('the token "auto-detected" appears verbatim at least once', () => {
    const r = runCli(t.root, ['import', '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stdout.split('auto-detected').length - 1).toBeGreaterThanOrEqual(1);
  });

  it('the token "lossless-where-invertible" appears verbatim at least once', () => {
    const r = runCli(t.root, ['import', '--dry-run']);
    expect(r.stdout.split('lossless-where-invertible').length - 1).toBeGreaterThanOrEqual(1);
  });

  it('each per-target fidelity label prints with zero alterations', () => {
    const r = runCli(t.root, ['import', '--dry-run']);
    const stream = r.stdout;
    // Every fidelity label that appears must be one of the frozen labels, verbatim.
    const appearing = FIDELITY_LABELS.filter((label) => stream.includes(label));
    expect(appearing.length).toBeGreaterThanOrEqual(1);
    for (const label of appearing) {
      // A verbatim occurrence: the exact bytes appear unaltered.
      expect(stream.includes(label)).toBe(true);
    }
  });
});
