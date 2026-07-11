import { Warning } from '../domain/warnings';
import { FileReport, ImportReport, FidelityLevel } from './types';

export interface ReportBuilderOptions {
  resolvedFormat: string;
  resolutionMethod: 'auto-detected' | 'explicitly-specified';
  dryRun: boolean;
  /** Candidate targets an explicit `--format` overrode when the layout was ambiguous (AC-007). */
  overriddenCandidates?: string[];
}

/**
 * Aggregate per-file outcomes into a complete per-run import report
 * (FR-044, FR-029, FR-088, FR-022, FR-021, FR-063, FR-064, FR-062, NFR-005).
 *
 * Guarantees:
 * - Every dropped or skipped file appears in the report (FR-088, FR-022)
 * - Every warning is grouped with its remediation (FR-029)
 * - No unqualified loss-free claims (FR-062)
 * - Every defaulted choice is surfaced (FR-064)
 */
export function buildImportReport(
  files: FileReport[],
  opts: ReportBuilderOptions,
): ImportReport {
  const allWarnings: Warning[] = [];
  for (const f of files) allWarnings.push(...f.warnings);

  const portabilityWarnings = allWarnings.filter((w) => w.kind === 'portability');

  // FR-022, NFR-005: a silent drop is a dropped/skipped file that surfaced 0 warnings.
  // Computed from the actual file set (not a structural constant) so the zero-silent-drop
  // invariant is *measured* over whatever files this run produced.
  const silentDropCount = files.filter(
    (f) => !f.outcome.ok && f.warnings.length === 0,
  ).length;

  const preview = buildPreview(files, opts);

  return {
    resolvedFormat: opts.resolvedFormat,
    resolutionMethod: opts.resolutionMethod,
    files,
    portabilityWarnings,
    allWarnings,
    silentDropCount,
    preview,
    dryRun: opts.dryRun,
    ...(opts.overriddenCandidates && opts.overriddenCandidates.length >= 2
      ? { ambiguityResolvedByOverride: { candidates: opts.overriddenCandidates } }
      : {}),
  };
}

/**
 * Format the consolidated portability report (FR-029).
 * Groups every warning with its remediation suggestion.
 */
export function formatPortabilityReport(report: ImportReport): string[] {
  const lines: string[] = [];
  if (report.portabilityWarnings.length === 0) return lines;

  lines.push('=== Portability Report ===');
  for (const w of report.portabilityWarnings) {
    const where = [w.artifact, w.target].filter(Boolean).join(' → ');
    lines.push(`  [${w.kind}] ${where}: ${w.message}`);
    const remediation = (w as any).remediation;
    if (remediation) {
      lines.push(`    Remediation: ${remediation}`);
    }
  }
  return lines;
}

/**
 * Format a human-readable summary of the import run (FR-007, FR-051, FR-044).
 */
export function formatRunSummary(report: ImportReport): string[] {
  const lines: string[] = [];

  const succeeded = report.files.filter((f) => f.outcome.ok).length;
  const dropped = report.files.filter((f) => !f.outcome.ok).length;
  const verified = report.files.filter(
    (f) => f.roundTrip?.verified,
  ).length;

  lines.push(
    `import: format=${report.resolvedFormat} (${report.resolutionMethod}), ` +
      `${succeeded} imported, ${dropped} dropped, ${verified} round-trip verified`,
  );

  if (report.dryRun) {
    lines.push('(dry-run: 0 files written)');
  }

  // Per-target fidelity levels (FR-023) — no unqualified loss-free claims (FR-062)
  const fidelityByTarget = new Map<string, Set<FidelityLevel>>();
  for (const f of report.files) {
    if (f.roundTrip) {
      const set = fidelityByTarget.get(f.targetId) ?? new Set();
      set.add(f.roundTrip.fidelity);
      fidelityByTarget.set(f.targetId, set);
    }
  }
  for (const [targetId, fidelities] of fidelityByTarget) {
    const levels = [...fidelities].join(', ');
    lines.push(`  fidelity[${targetId}]: ${levels} (lossless-where-invertible with overrides fallback)`);
  }

  if (report.portabilityWarnings.length > 0) {
    lines.push(`  ${report.portabilityWarnings.length} portability warning(s) — see portability report`);
  }

  return lines;
}

function buildPreview(files: FileReport[], opts: ReportBuilderOptions): string[] {
  const lines: string[] = [`format: ${opts.resolvedFormat} (${opts.resolutionMethod})`];
  for (const f of files) {
    if (f.outcome.ok) {
      const rt = f.roundTrip;
      const rtStr = rt ? ` [${rt.fidelity}]` : '';
      lines.push(`  ✓ ${f.foreignPath} → ${f.outcome.artifactId}${rtStr}`);
    } else {
      lines.push(`  ✗ ${f.foreignPath}: ${f.outcome.reason}`);
    }
    for (const w of f.warnings) {
      const where = [w.artifact, w.target].filter(Boolean).join(' → ') || f.foreignPath;
      lines.push(`    warning[${w.kind}]: ${w.message}`);
    }
  }
  return lines;
}
