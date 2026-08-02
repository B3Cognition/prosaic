import * as fs from 'fs';
import * as path from 'path';
import { Registry } from '../registry/registry';
import { builtinRegistry } from '../registry/builtin';
import { resolveConfig } from '../config/resolve';
import { ImportRunOptions, ImportReport, FileReport } from './types';
import { detectFormat, resolveExplicitFormat, scanCandidates } from './detect/detect';
import { resolveScope } from './detect/scope';
import { unverifiedTargetWarning } from './detect/parity';
import { neutralize } from './neutralize/neutralize';
import { validateGate } from './neutralize/validate-gate';
import { roundTrip, fidelityLevel } from './verify/round-trip';
import { writeSource } from './write/source-writer';
import { idempotencyCheck } from './verify/idempotency';
import { scanPortabilityIssues } from './portability/warnings';
import { buildImportReport, formatPortabilityReport, formatRunSummary } from './report';

export { ImportReport };

/**
 * Orchestrate the full import flow: detection → neutralization → round-trip
 * verification → provenance-safe write → idempotency check → report (NFR-003).
 *
 * The run completes fully offline: 0 sockets opened, 0 credentials required.
 */
export function importRun(
  opts: ImportRunOptions,
  registry?: Registry,
): ImportReport {
  const reg = registry ?? builtinRegistry();
  const descriptors = reg.all();

  const { effective: config } = resolveConfig(opts.projectRoot, {
    source: opts.sourceDir,
  });
  const sourceRoot = path.resolve(opts.projectRoot, config.source);
  const foreignDir = opts.foreignDir
    ? path.resolve(opts.projectRoot, opts.foreignDir)
    : opts.projectRoot;

  // FR-001, FR-003, FR-004: format resolution
  let resolvedTargetId: string;
  let resolutionMethod: 'auto-detected' | 'explicitly-specified';
  const detectionWarnings: import('../domain/warnings').Warning[] = [];
  // AC-007: candidates an explicit --format overrode when the layout was ambiguous.
  let overriddenCandidates: string[] | undefined;

  if (opts.format) {
    const explicit = resolveExplicitFormat(opts.format, descriptors);
    if (!explicit.ok) {
      // FR-004, FR-046, FR-047: unknown format — reject, list identifiers, write 0 files
      return buildImportReport(
        [
          {
            foreignPath: foreignDir,
            targetId: opts.format,
            outcome: { ok: false, reason: explicit.error },
            warnings: [
              {
                kind: 'unrecognized-format',
                message: explicit.error,
              },
            ],
          },
        ],
        {
          resolvedFormat: opts.format,
          resolutionMethod: 'explicitly-specified',
          dryRun: opts.dryRun ?? false,
        },
      );
    }
    resolvedTargetId = explicit.targetId;
    resolutionMethod = 'explicitly-specified';

    // AC-007: even though the target is the named one (auto-detection runs 0 times,
    // FR-003), a candidate scan tells us whether the layout WAS ambiguous. If so,
    // record that the ambiguity was resolved by explicit override — distinguishing
    // this run from an unambiguous explicit run.
    const candidates = scanCandidates(foreignDir, opts.projectRoot, descriptors);
    if (candidates.length >= 2) {
      overriddenCandidates = candidates;
      detectionWarnings.push({
        kind: 'ambiguous-detection',
        message:
          `Foreign layout was ambiguous — matched ${candidates.length} targets: ` +
          `${candidates.join(', ')}. Ambiguity resolved by explicit --format "${explicit.targetId}".`,
      });
    }
  } else {
    // Auto-detection (FR-002)
    const detection = detectFormat(foreignDir, opts.projectRoot, descriptors);
    detectionWarnings.push(...detection.warnings);

    if (detection.outcome.kind === 'unrecognized') {
      return buildImportReport(
        [
          {
            foreignPath: foreignDir,
            targetId: '',
            outcome: { ok: false, reason: 'Unrecognized layout — no matching target' },
            warnings: detection.warnings,
          },
        ],
        {
          resolvedFormat: 'unknown',
          resolutionMethod: 'auto-detected',
          dryRun: opts.dryRun ?? false,
        },
      );
    }

    if (detection.outcome.kind === 'ambiguous') {
      return buildImportReport(
        [
          {
            foreignPath: foreignDir,
            targetId: '',
            outcome: {
              ok: false,
              reason: `Ambiguous: ${detection.outcome.candidates.join(', ')} — supply --format`,
            },
            warnings: detection.warnings,
          },
        ],
        {
          resolvedFormat: 'ambiguous',
          resolutionMethod: 'auto-detected',
          dryRun: opts.dryRun ?? false,
        },
      );
    }

    resolvedTargetId = detection.outcome.targetId;
    resolutionMethod = 'auto-detected';
  }

  // FR-008: descriptor must be in registry
  const desc = reg.get(resolvedTargetId);

  // FR-052: warn if target not import-parity verified
  const parityWarning = unverifiedTargetWarning(resolvedTargetId);

  // Resolve scope: collect foreign files attributed to the target (FR-043, FR-078)
  const { attributed, unattributed } = resolveScope(
    [foreignDir],
    opts.projectRoot,
    descriptors,
    opts.format ? resolvedTargetId : undefined,
  );

  const fileReports: FileReport[] = [];

  // Report unattributed files (FR-022, FR-063, FR-088)
  for (const ua of unattributed) {
    fileReports.push({
      foreignPath: ua.relToRoot,
      targetId: '',
      outcome: {
        ok: false,
        reason: `File "${ua.relToRoot}" could not be attributed to exactly 1 target within the run scope.`,
      },
      warnings: [
        {
          kind: 'unrecognized-format',
          artifact: ua.relToRoot,
          message: `File "${ua.relToRoot}" matches 0 or 2+ targets — skipped with a warning (0 silent skips).`,
        },
      ],
    });
  }

  // Process each attributed file
  for (const file of attributed) {
    if (file.targetId !== resolvedTargetId) continue; // scope limited to resolved target

    const fileDec = desc; // use the resolved descriptor
    const foreignPath = file.relToRoot;
    const fileWarnings: import('../domain/warnings').Warning[] = [];

    if (parityWarning) fileWarnings.push(parityWarning);
    fileWarnings.push(...detectionWarnings);

    // Neutralize
    const neutralResult = neutralize(file.abs, foreignPath, fileDec, opts.projectRoot);
    if (!neutralResult.ok) {
      fileReports.push({
        foreignPath,
        targetId: resolvedTargetId,
        outcome: { ok: false, reason: neutralResult.dropped.reason },
        warnings: [...fileWarnings, ...neutralResult.dropped.warnings],
      });
      continue;
    }

    const { artifact, overrides, defaultedChoices, warnings: neutralWarnings } = neutralResult.result;
    fileWarnings.push(...neutralWarnings);

    // Validate gate (FR-030, FR-066)
    const gated = validateGate(artifact, foreignPath);
    if (!gated.ok) {
      fileReports.push({
        foreignPath,
        targetId: resolvedTargetId,
        outcome: { ok: false, reason: 'Neutral frontmatter validation failed' },
        warnings: [...fileWarnings, ...gated.warnings],
      });
      continue;
    }

    const validArtifact = gated.artifact;

    // Portability scan (FR-025, FR-026, FR-027)
    const portabilityWarnings = scanPortabilityIssues(
      validArtifact.frontmatter,
      validArtifact.body,
      foreignPath,
    );
    fileWarnings.push(...portabilityWarnings);

    // Round-trip verification (FR-036..FR-040)
    let originalContent: string;
    try {
      originalContent = fs.readFileSync(file.abs, 'utf8');
    } catch {
      originalContent = '';
    }

    const { result: rtResult, warnings: rtWarnings } = roundTrip(
      validArtifact,
      fileDec,
      originalContent,
      foreignPath,
    );
    fileWarnings.push(...rtWarnings);

    const hasOverrides = Object.keys(overrides).length > 0;
    const fidelity = fidelityLevel(rtResult, hasOverrides);

    // Write source (FR-031..FR-035, FR-082, FR-086)
    const writeResult = writeSource(validArtifact, sourceRoot, opts.projectRoot, {
      dryRun: opts.dryRun,
      overwrite: opts.overwrite,
    });
    fileWarnings.push(...writeResult.warnings);

    // Source-level idempotency (FR-040, FR-072, NFR-002) — only on actual writes
    if (writeResult.written) {
      const idem = idempotencyCheck(validArtifact, fileDec, sourceRoot, opts.projectRoot);
      fileWarnings.push(...idem.warnings);
    }

    fileReports.push({
      foreignPath,
      targetId: resolvedTargetId,
      outcome: {
        ok: true,
        artifactId: validArtifact.id,
        type: validArtifact.type,
        fidelity,
      },
      roundTrip: rtResult,
      warnings: fileWarnings,
    });
  }

  const report = buildImportReport(
    fileReports,
    {
      resolvedFormat: resolvedTargetId,
      resolutionMethod,
      dryRun: opts.dryRun ?? false,
      overriddenCandidates,
    },
    opts.theme,
  );

  return report;
}
