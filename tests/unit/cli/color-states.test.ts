import { previewPlan } from '../../../src/lifecycle/dry-run';
import { buildImportReport } from '../../../src/import/report';
import { styledTheme, plainTheme } from '../../../src/cli/theme';
import { RunPlan } from '../../../src/lifecycle/plan';
import { FileReport } from '../../../src/import/types';
import { isAscii, stripAnsi } from '../../helpers/strip-ansi';

const OPENING_SGR = new RegExp(String.raw`\x1b\[(\d+)m`, 'g');

/** All SGR opening codes present in a string, in order. */
function codes(s: string): string[] {
  return [...s.matchAll(OPENING_SGR)].map((m) => m[1]);
}

const plan: RunPlan = {
  writes: [
    { targetId: 'claude-code', path: '.claude/a.md', content: '', hash: 'h', changeType: 'create', backupNeeded: false },
    { targetId: 'cursor', path: '.cursor/b.mdc', content: '', hash: 'h', changeType: 'overwrite', backupNeeded: false },
  ],
  removals: [{ targetId: 'claude-code', path: '.claude/old.md' }],
  warnings: [],
};

const importFiles: FileReport[] = [
  {
    foreignPath: '.clinerules/ok.md',
    targetId: 'cline',
    outcome: { ok: true, artifactId: 'rules/ok.md', type: 'rule', fidelity: 'fully-invertible' },
    roundTrip: { verified: true, fidelity: 'fully-invertible', diffRegions: [] },
    warnings: [],
  },
  {
    foreignPath: '.clinerules/bad.md',
    targetId: 'cline',
    outcome: { ok: false, reason: 'malformed' },
    warnings: [],
  },
];

describe('per-state color wrappers in the formatters (T-017, FR-006/022/023/024/025)', () => {
  const styledPreview = previewPlan(plan, 'apply', styledTheme);
  const createLine = styledPreview.find((l) => stripAnsi(l).includes('create '))!;
  const overwriteLine = styledPreview.find((l) => stripAnsi(l).includes('update '))!;
  const removeLine = styledPreview.find((l) => stripAnsi(l).includes('remove '))!;

  // Distinct opening codes for the four outcome states + the path style.
  const created = codes(styledTheme.created('x'))[0];
  const overwrite = codes(styledTheme.overwrite('x'))[0];
  const error = codes(styledTheme.error('x'))[0];
  const unchanged = codes(styledTheme.unchanged('x'))[0];
  const pathStyle = codes(styledTheme.path('x'))[0];

  it('each outcome state carries one color code unused by the others', () => {
    const outcomeCodes = [created, overwrite, error, unchanged];
    expect(new Set(outcomeCodes).size).toBe(outcomeCodes.length);
  });

  it('the created state line carries the created color', () => {
    expect(codes(createLine)).toContain(created);
  });

  it('the overwrite state line carries the overwrite color', () => {
    expect(codes(overwriteLine)).toContain(overwrite);
  });

  it('the error/dropped state line carries the error color', () => {
    expect(codes(removeLine)).toContain(error);
    const report = buildImportReport(importFiles, { resolvedFormat: 'cline', resolutionMethod: 'auto-detected', dryRun: true }, styledTheme);
    const dropped = report.preview.find((l) => stripAnsi(l).includes('.clinerules/bad.md'))!;
    expect(codes(dropped)).toContain(error);
  });

  it('the path carries one style code disjoint from every outcome-state color', () => {
    expect([created, overwrite, error, unchanged]).not.toContain(pathStyle);
    // The created preview line paints the path with the path style.
    expect(codes(createLine)).toContain(pathStyle);
  });
});

describe('non-color signal and ASCII glyph fallback (T-018, FR-007/008, NFR-004/007)', () => {
  it('every plain preview line stays identifiable via an ASCII text marker', () => {
    const report = buildImportReport(importFiles, { resolvedFormat: 'cline', resolutionMethod: 'auto-detected', dryRun: true }, plainTheme);
    const okLine = report.preview.find((l) => l.includes('.clinerules/ok.md'))!;
    const dropLine = report.preview.find((l) => l.includes('.clinerules/bad.md'))!;
    // A non-color signal distinguishes the two states without any color.
    expect(okLine).toContain(plainTheme.okMarker);
    expect(dropLine).toContain(plainTheme.dropMarker);
    expect(okLine).not.toContain(plainTheme.dropMarker);
  });

  it('the plain path holds zero non-ASCII bytes', () => {
    const report = buildImportReport(importFiles, { resolvedFormat: 'cline', resolutionMethod: 'auto-detected', dryRun: true }, plainTheme);
    expect(isAscii(report.preview.join('\n'))).toBe(true);
    expect(isAscii(previewPlan(plan, 'apply', plainTheme).join('\n'))).toBe(true);
  });

  it('every output state stays identifiable without color (plain markers are distinct)', () => {
    expect(plainTheme.okMarker).not.toBe(plainTheme.dropMarker);
    expect(isAscii(plainTheme.okMarker + plainTheme.dropMarker + plainTheme.arrow)).toBe(true);
  });
});
