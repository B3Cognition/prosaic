import { Warning } from '../domain/warnings';
import { FileReport, ImportReport, FidelityLevel } from './types';
import { Theme, plainTheme } from '../cli/theme';

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
 *
 * The optional `theme` styles the pre-rendered preview (T-017); it defaults to the
 * plain theme so the report stays byte-identical to pre-enhancement output unless
 * a caller resolves a styled stream. buildPreview is module-private, so the theme
 * is threaded from this exported builder down into it (not from an external
 * caller).
 */
export function buildImportReport(
  files: FileReport[],
  opts: ReportBuilderOptions,
  theme: Theme = plainTheme,
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

  const preview = buildPreview(files, opts, theme);

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
 * Format the consolidated portability report (FR-029, FR-012).
 * Groups every warning under the report header, printing exactly one remediation
 * line immediately after each warning. The remediation line is de-emphasized
 * (dim) only when the stream theme is styled.
 */
export function formatPortabilityReport(report: ImportReport, theme: Theme = plainTheme): string[] {
  const lines: string[] = [];
  if (report.portabilityWarnings.length === 0) return lines;

  lines.push('=== Portability Report ===');
  for (const w of report.portabilityWarnings) {
    const where = [w.artifact, w.target].filter(Boolean).join(` ${theme.arrow} `);
    lines.push(`  ${theme.overwrite(`[${w.kind}]`)} ${where}: ${w.message}`);
    // FR-012: exactly one remediation line per warning. When no explicit remediation
    // is supplied, a generic one keeps the one-per-warning invariant intact.
    const remediation = (w as any).remediation ?? 'Review this warning; no automatic remediation available.';
    lines.push(theme.dim(`    Remediation: ${remediation}`));
  }
  return lines;
}

/**
 * Format a human-readable summary of the import run (FR-007, FR-051, FR-044, FR-011).
 *
 * The run counts are laid out as fixed-width aligned rows: each count token begins
 * at one shared character column, computed from the label widths (never from the
 * stream's column count), so the layout is byte-identical with or without a
 * terminal width and holds zero escapes on the plain path (FR-011, FR-026).
 */
export function formatRunSummary(report: ImportReport, theme: Theme = plainTheme): string[] {
  const lines: string[] = [];

  const succeeded = report.files.filter((f) => f.outcome.ok).length;
  const dropped = report.files.filter((f) => !f.outcome.ok).length;
  const verified = report.files.filter(
    (f) => f.roundTrip?.verified,
  ).length;

  // Header keeps the format + resolution-method contractual token verbatim
  // (FR-013): "auto-detected" / "explicitly-specified".
  lines.push(`import: format=${report.resolvedFormat} (${report.resolutionMethod})`);

  // FR-011: align every count token at one shared column via fixed-width padding
  // derived from the label lengths, independent of terminal width (FR-026).
  const countRows: Array<[string, number]> = [
    ['imported', succeeded],
    ['dropped', dropped],
    ['round-trip verified', verified],
  ];
  // padEnd the label to the widest label so every count token begins at the same
  // character column, independent of the terminal width (FR-011, FR-026).
  const labelWidth = Math.max(...countRows.map(([label]) => label.length));
  for (const [label, count] of countRows) {
    lines.push(`  ${label.padEnd(labelWidth)}  ${count}`);
  }

  if (report.dryRun) {
    lines.push('(dry-run: 0 files written)');
  }

  // Per-target fidelity levels (FR-023, FR-028) — no unqualified loss-free claims
  // (FR-062, FR-014, FR-031). The fidelity label and the "lossless-where-invertible"
  // token (FR-027) are preserved verbatim in every presentation mode.
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

/**
 * Render the per-file import preview (T-017, T-018).
 *
 * Each outcome renders its state color through the injected theme (created→one
 * color, dropped→a distinct color) and a non-color status marker plus the path
 * style, so every state stays identifiable when color is removed (FR-007,
 * NFR-004). The status markers and the arrow come from the theme so the plain
 * path holds zero non-ASCII bytes (FR-008, NFR-007).
 */
function buildPreview(files: FileReport[], opts: ReportBuilderOptions, theme: Theme): string[] {
  const lines: string[] = [`format: ${opts.resolvedFormat} (${opts.resolutionMethod})`];
  for (const f of files) {
    if (f.outcome.ok) {
      const rt = f.roundTrip;
      const rtStr = rt ? ` [${rt.fidelity}]` : '';
      lines.push(
        `  ${theme.created(theme.okMarker)} ${theme.path(f.foreignPath)} ${theme.arrow} ` +
          `${theme.path(f.outcome.artifactId)}${rtStr}`,
      );
    } else {
      lines.push(`  ${theme.error(theme.dropMarker)} ${theme.path(f.foreignPath)}: ${f.outcome.reason}`);
    }
    for (const w of f.warnings) {
      lines.push(`    ${theme.warn('warning')}[${w.kind}]: ${w.message}`);
    }
  }
  return lines;
}
