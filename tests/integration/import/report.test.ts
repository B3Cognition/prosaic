import { buildImportReport, formatPortabilityReport, formatRunSummary } from '../../../src/import/report';
import { FileReport } from '../../../src/import/types';

const dropReport: FileReport = {
  foreignPath: '.claude/agents/broken.md',
  targetId: 'claude-code',
  outcome: { ok: false, reason: 'malformed frontmatter' },
  warnings: [
    { kind: 'malformed-frontmatter', artifact: '.claude/agents/broken.md', message: 'invalid YAML' },
  ],
};

const successReport: FileReport = {
  foreignPath: '.claude/commands/cmd.md',
  targetId: 'claude-code',
  outcome: { ok: true, artifactId: 'commands/cmd.md', type: 'command', fidelity: 'fully-invertible' },
  roundTrip: { verified: true, fidelity: 'fully-invertible', diffRegions: [] },
  warnings: [],
};

const portabilityReport: FileReport = {
  foreignPath: '.clinerules/rule.md',
  targetId: 'cline',
  outcome: { ok: true, artifactId: 'rules/rule.md', type: 'rule', fidelity: 'invertible-with-overrides' },
  roundTrip: { verified: false, fidelity: 'invertible-with-overrides', diffRegions: [] },
  warnings: [
    {
      kind: 'portability',
      artifact: '.clinerules/rule.md',
      message: 'Field "path" contains an absolute path: "/usr/local/bin"',
      remediation: 'Use a relative path instead.',
    } as any,
  ],
};

describe('import report aggregation (T-018, FR-029, FR-044, FR-088, FR-022, FR-021, FR-063, FR-064, NFR-005)', () => {
  const opts = {
    resolvedFormat: 'claude-code',
    resolutionMethod: 'auto-detected' as const,
    dryRun: false,
  };

  it('produces a per-run report covering each foreign file (FR-044)', () => {
    const report = buildImportReport([dropReport, successReport], opts);
    expect(report.files).toHaveLength(2);
    expect(report.files.map((f) => f.foreignPath)).toContain('.claude/agents/broken.md');
    expect(report.files.map((f) => f.foreignPath)).toContain('.claude/commands/cmd.md');
  });

  it('silent-drop count is always exactly 0 (FR-022, NFR-005)', () => {
    const report = buildImportReport([dropReport, successReport], opts);
    expect(report.silentDropCount).toBe(0);
  });

  it('dropped files appear in the report with explaining warnings (FR-088)', () => {
    const report = buildImportReport([dropReport], opts);
    const drop = report.files.find((f) => f.foreignPath === '.claude/agents/broken.md');
    expect(drop).toBeDefined();
    expect(drop!.outcome.ok).toBe(false);
    expect(drop!.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('portability warnings are grouped in portabilityWarnings (FR-029)', () => {
    const report = buildImportReport([portabilityReport], opts);
    expect(report.portabilityWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it('formatPortabilityReport groups every warning with its remediation (FR-029)', () => {
    const report = buildImportReport([portabilityReport], opts);
    const lines = formatPortabilityReport(report);
    expect(lines.length).toBeGreaterThan(0);
    const hasRemediation = lines.some((l) => l.includes('Remediation'));
    expect(hasRemediation).toBe(true);
  });

  it('formatRunSummary states resolved format and resolution method (FR-007, FR-051)', () => {
    const report = buildImportReport([successReport], opts);
    const summary = formatRunSummary(report);
    const joined = summary.join('\n');
    expect(joined).toContain('claude-code');
    expect(joined).toContain('auto-detected');
  });

  it('run summary does not claim unqualified loss-free import (FR-062)', () => {
    const report = buildImportReport([successReport], opts);
    const summary = formatRunSummary(report);
    const joined = summary.join('\n').toLowerCase();
    // Should not say "nothing is lost" or "100% lossless" unqualified
    expect(joined).not.toContain('nothing is lost');
    expect(joined).not.toContain('100% lossless');
    // Should use the qualified phrasing
    expect(joined).toContain('lossless-where-invertible');
  });
});
