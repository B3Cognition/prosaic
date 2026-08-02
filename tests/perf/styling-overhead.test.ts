import * as fs from 'fs';
import * as path from 'path';
import { apply } from '../../src/lifecycle/run';
import { builtinRegistry } from '../../src/registry/builtin';
import { plainTheme, styledTheme, Theme } from '../../src/cli/theme';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedCorpus } from '../helpers/corpus';

// T-022 / NFR-006 (AC-verify: wall-clock increase ≤ 5 percent).
//
// A styled command must keep wall-clock time within 5 percent of the
// pre-enhancement plain baseline. The styling enhancement lives entirely in the
// presentation layer (theme wrappers that prepend/append SGR codes over the
// dry-run preview), so it is a small fraction of a real command's wall-clock —
// which is dominated by discovery (filesystem reads + content hashing) and
// planning. This benchmark measures the same dry-run `apply` command over a
// fixed fixture twice: once threaded with the plain theme (the pre-enhancement
// baseline) and once with the styled theme, then asserts the styled run stays
// within the 5 percent budget. A measured, 906-scoped artifact is emitted so CI
// can archive it as build evidence.

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'perf-styling-nfr006.json');

/** Fixture size: enough writes that the themed preview is exercised in full. */
const CORPUS_SIZE = 80;
/** Warm-up rounds (JIT + fs cache) discarded before measurement. */
const WARMUP = 4;
/** Measured, interleaved rounds per theme. */
const ROUNDS = 25;
/** Wall-clock budget: styled must stay within +5% of the plain baseline. */
const BUDGET_PCT = 5;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

describe('NFR-006: styled-command wall-clock stays within 5% of the plain baseline', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot('prosaic-nfr006-');
    seedCorpus(t, CORPUS_SIZE);
  });
  afterEach(() => t.cleanup());

  it('the styled dry-run wall-clock is within 5% of the plain dry-run baseline', () => {
    // A dry-run apply threads the stream theme into the preview (previewPlan),
    // so plain-vs-styled isolates exactly the styling overhead within a real
    // command's wall-clock. Dry-run writes nothing, so every round does
    // identical work and re-running is side-effect-free.
    const measure = (theme: Theme): number => {
      const start = process.hrtime.bigint();
      apply({ projectRoot: t.root, registry: builtinRegistry(), dryRun: true, theme });
      return Number(process.hrtime.bigint() - start) / 1e6; // ms
    };

    // Warm up both paths equally so JIT/fs-cache effects don't bias one theme.
    for (let i = 0; i < WARMUP; i++) {
      measure(plainTheme);
      measure(styledTheme);
    }

    // Interleave the two themes per round so any monotonic drift (thermal,
    // scheduler) is shared by both series and cancels in the comparison.
    const plainMs: number[] = [];
    const styledMs: number[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      plainMs.push(measure(plainTheme));
      styledMs.push(measure(styledTheme));
    }

    // The minimum is the cleanest signal of the true computational cost (least
    // interference from GC / scheduling spikes); the styled run does strictly
    // more work, so styledMin ≥ plainMin and the ratio exposes real overhead.
    const plainMin = Math.min(...plainMs);
    const styledMin = Math.min(...styledMs);
    const baselineMs = plainMin;
    const overheadPct = baselineMs > 0 ? ((styledMin - baselineMs) / baselineMs) * 100 : 0;
    const pass = overheadPct <= BUDGET_PCT;

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-006',
          ac: 'NFR-006',
          evidenceKind: 'measured_runtime',
          description:
            'Styled-command wall-clock stays within 5% of the pre-enhancement plain baseline (styled vs plain dry-run apply over a fixed fixture)',
          command: 'apply --dry-run (themed preview)',
          corpusSize: CORPUS_SIZE,
          warmupRounds: WARMUP,
          measuredRounds: ROUNDS,
          nodeVersion: process.version,
          platform: process.platform,
          plainBaselineMs: {
            min: plainMin,
            median: median(plainMs),
            max: Math.max(...plainMs),
          },
          styledMs: {
            min: styledMin,
            median: median(styledMs),
            max: Math.max(...styledMs),
          },
          overheadPct: Number(overheadPct.toFixed(4)),
          budgetPct: BUDGET_PCT,
          measurableTarget: 'styled wall-clock increase over plain baseline ≤ 5 percent',
          pass,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    expect(overheadPct).toBeLessThanOrEqual(BUDGET_PCT);
  });
});
