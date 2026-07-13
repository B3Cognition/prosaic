import { runCli } from '../helpers/run-cli';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedMandatoryWarnings } from '../helpers/seed-cli';

/**
 * T-006 (FR-015): a mandatory skip/drop/loss warning is surfaced exactly once per
 * event, in every presentation mode. Seeding a skill with an `effort` intent plus
 * a skill-incapable target forces one lossy-intent event (effort dropped) and one
 * unsupported-pair event (skill on cursor); a presentation change must never
 * suppress or duplicate either.
 */
describe('mandatory warning surfaced once per event, every mode (T-006)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedMandatoryWarnings(t);
  });
  afterEach(() => t.cleanup());

  const MODES: Array<[string, NodeJS.ProcessEnv]> = [
    ['plain', { NO_COLOR: '1' }],
    ['styled', { FORCE_COLOR: '1' }],
  ];

  function occurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
  }

  for (const [name, env] of MODES) {
    it(`each forced event surfaces exactly one warning in ${name} mode`, () => {
      // apply warnings surface on stdout (A-005).
      const r = runCli(t.root, ['apply', '--dry-run'], env);
      const stream = r.stdout;
      // Exactly one lossy-intent event (effort dropped).
      expect(occurrences(stream, 'warning[lossy-intent]')).toBe(1);
      expect(occurrences(stream, 'effort')).toBe(1);
      // Exactly one unsupported-pair event (skill on a skill-incapable target).
      expect(occurrences(stream, 'warning[unsupported-pair]')).toBe(1);
    });
  }
});
