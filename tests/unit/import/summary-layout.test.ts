import { buildImportReport, formatRunSummary, formatPortabilityReport } from '../../../src/import/report';
import { FileReport } from '../../../src/import/types';
import { plainTheme } from '../../../src/cli/theme';
import { countEscapes } from '../../helpers/strip-ansi';

const files: FileReport[] = [
  {
    foreignPath: '.clinerules/a.md',
    targetId: 'cline',
    outcome: { ok: true, artifactId: 'rules/a.md', type: 'rule', fidelity: 'fully-invertible' },
    roundTrip: { verified: true, fidelity: 'fully-invertible', diffRegions: [] },
    warnings: [],
  },
  {
    foreignPath: '.clinerules/b.md',
    targetId: 'cline',
    outcome: { ok: false, reason: 'malformed' },
    warnings: [
      { kind: 'portability', artifact: '.clinerules/b.md', message: 'absolute path', remediation: 'Use relative.' } as never,
    ],
  },
];

const report = buildImportReport(files, { resolvedFormat: 'cline', resolutionMethod: 'auto-detected', dryRun: false });

/** The character column at which a summary count line's value begins. */
function countColumn(line: string): number {
  // "  <label padded>  <count>" — the count begins after the run of spaces
  // following the label. Find the last 2-space gap.
  const idx = line.lastIndexOf('  ');
  return idx + 2;
}

describe('width-independent fixed-width count alignment (T-019, FR-011, FR-026)', () => {
  it('every count token begins at one shared character column', () => {
    const lines = formatRunSummary(report);
    const countLines = lines.filter((l) => /\b(imported|dropped|round-trip verified)\b/.test(l));
    expect(countLines.length).toBe(3);
    const columns = countLines.map(countColumn);
    expect(new Set(columns).size).toBe(1);
  });

  it('the aligned layout holds zero escapes and is identical with or without a columns value', () => {
    const saved = process.stdout.columns;
    try {
      (process.stdout as { columns?: number }).columns = 40;
      const narrow = formatRunSummary(report, plainTheme).join('\n');
      (process.stdout as { columns?: number }).columns = undefined;
      const unknownWidth = formatRunSummary(report, plainTheme).join('\n');
      expect(narrow).toBe(unknownWidth);
      expect(countEscapes(unknownWidth)).toBe(0);
    } finally {
      (process.stdout as { columns?: number }).columns = saved;
    }
  });
});

describe('grouped portability report with one remediation per warning (T-020, FR-012)', () => {
  it('each portability warning is followed by exactly one remediation line under the header', () => {
    const lines = formatPortabilityReport(report);
    expect(lines[0]).toBe('=== Portability Report ===');
    const warningIdxs = lines.map((l, i) => ({ l, i })).filter(({ l }) => /^\s{2}\[/.test(l));
    expect(warningIdxs.length).toBeGreaterThanOrEqual(1);
    for (const { i } of warningIdxs) {
      // Exactly one remediation line immediately follows each warning.
      expect(lines[i + 1]).toMatch(/^\s{4}Remediation: /);
      // And it is not itself another warning.
      expect(lines[i + 1]).not.toMatch(/^\s{2}\[/);
    }
    const remediationCount = lines.filter((l) => /Remediation: /.test(l)).length;
    expect(remediationCount).toBe(warningIdxs.length);
  });
});
