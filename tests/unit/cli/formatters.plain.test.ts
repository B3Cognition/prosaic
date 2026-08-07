import { buildImportReport, formatRunSummary, formatPortabilityReport } from '../../../src/import/report';
import { previewPlan } from '../../../src/lifecycle/dry-run';
import { surfaceWarnings } from '../../../src/lifecycle/warnings';
import { FileReport } from '../../../src/import/types';
import { RunPlan } from '../../../src/lifecycle/plan';
import { plainTheme } from '../../../src/cli/theme';
import { countEscapes, isAscii } from '../../helpers/strip-ansi';
import { REQUIRED_TOKENS, PROHIBITED_PHRASES } from '../../helpers/tokens';

/**
 * T-004 (NFR-005): every pure formatter invoked with the default plain theme
 * produces plain output that (a) is byte-identical whether the plain theme is
 * passed explicitly or defaulted, (b) holds zero escape sequences, and (c) keeps
 * 100% of formatter-level verbatim-token assertions passing. This is the
 * regression net proving the plain theme adds nothing.
 */

const files: FileReport[] = [
  {
    foreignPath: '.clinerules/rule.md',
    targetId: 'cline',
    outcome: { ok: true, artifactId: 'rules/rule.md', type: 'rule', fidelity: 'fully-invertible' },
    roundTrip: { verified: true, fidelity: 'fully-invertible', diffRegions: [] },
    warnings: [],
  },
  {
    foreignPath: '.clinerules/bad.md',
    targetId: 'cline',
    outcome: { ok: false, reason: 'malformed frontmatter' },
    warnings: [
      {
        kind: 'portability',
        artifact: '.clinerules/bad.md',
        message: 'absolute path detected',
        remediation: 'Use a relative path.',
      } as never,
    ],
  },
];

const report = buildImportReport(files, {
  resolvedFormat: 'cline',
  resolutionMethod: 'auto-detected',
  dryRun: true,
});

const plan: RunPlan = {
  writes: [
    { targetId: 'claude-code', path: '.claude/a.md', content: '', hash: 'h', changeType: 'create', backupNeeded: false },
    { targetId: 'cursor', path: '.cursor/b.mdc', content: '', hash: 'h', changeType: 'overwrite', backupNeeded: true },
  ],
  removals: [{ targetId: 'claude-code', path: '.claude/old.md' }],
  warnings: [],
};

const warnings = [
  { kind: 'lossy-intent' as const, artifact: 'skills/x', target: 'cursor', message: 'dropped effort' },
];

describe('formatters with the plain theme (T-004, NFR-005)', () => {
  const cases: Array<[string, string[], string[]]> = [
    ['formatRunSummary', formatRunSummary(report), formatRunSummary(report, plainTheme)],
    ['formatPortabilityReport', formatPortabilityReport(report), formatPortabilityReport(report, plainTheme)],
    ['previewPlan', previewPlan(plan, 'apply'), previewPlan(plan, 'apply', plainTheme)],
    ['surfaceWarnings', surfaceWarnings(warnings), surfaceWarnings(warnings, plainTheme)],
    ['report.preview', report.preview, report.preview],
  ];

  it('the default is the plain theme: explicit-plain output is byte-identical', () => {
    for (const [name, defaulted, explicit] of cases) {
      expect(explicit.join('\n')).toBe(defaulted.join('\n'));
      expect(name).toBeTruthy();
    }
  });

  it('every formatter holds zero escape sequences under the plain theme', () => {
    for (const [, defaulted] of cases) {
      expect(countEscapes(defaulted.join('\n'))).toBe(0);
    }
  });

  it('the plain path holds zero non-ASCII bytes', () => {
    for (const [, defaulted] of cases) {
      expect(isAscii(defaulted.join('\n'))).toBe(true);
    }
  });

  it('zero formatter-level verbatim-token assertions fail', () => {
    const summary = formatRunSummary(report).join('\n');
    for (const token of REQUIRED_TOKENS) {
      expect(summary.includes(token)).toBe(true);
    }
    const everything = cases.map(([, d]) => d.join('\n')).join('\n');
    for (const phrase of PROHIBITED_PHRASES) {
      expect(everything.includes(phrase)).toBe(false);
    }
  });
});
