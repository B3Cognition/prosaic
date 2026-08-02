import { runCli } from '../helpers/run-cli';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedImportForeign } from '../helpers/seed-cli';
import { PROHIBITED_PHRASES } from '../helpers/tokens';

/**
 * T-003 (FR-014, FR-031): prohibited fidelity phrases stay absent on every
 * captured stream, in both plain and forced-color modes.
 */
describe('prohibited fidelity phrases stay absent (T-003)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedImportForeign(t);
  });
  afterEach(() => t.cleanup());

  const MODES: Array<[string, NodeJS.ProcessEnv]> = [
    ['plain', { NO_COLOR: '1' }],
    ['styled', { FORCE_COLOR: '1' }],
  ];

  for (const [name, env] of MODES) {
    it(`neither prohibited phrase occurs in ${name} mode`, () => {
      const r = runCli(t.root, ['import', '--dry-run'], env);
      const combined = r.stdout + r.stderr;
      for (const phrase of PROHIBITED_PHRASES) {
        expect(combined.split(phrase).length - 1).toBe(0);
      }
    });
  }
});
