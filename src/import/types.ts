import { ArtifactType } from '../domain/types';
import { Warning } from '../domain/warnings';

/** The three outcomes of auto-detection (FR-002). */
export type DetectionOutcome =
  | { kind: 'single'; targetId: string; method: 'auto-detected' | 'explicit' }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'unrecognized' };

/** Per-target fidelity levels assigned during round-trip verification (FR-023). */
export type FidelityLevel = 'fully-invertible' | 'invertible-with-overrides' | 'normalized-equivalent' | 'mismatch';

/** Outcome for a single imported file. */
export type FileOutcome =
  | { ok: true; artifactId: string; type: ArtifactType; fidelity: FidelityLevel }
  | { ok: false; reason: string };

/** A single region where re-deployed output differed from the original. */
export interface DiffRegion {
  original: string;
  redeployed: string;
}

/** Round-trip verification result for one file (FR-036..FR-040). */
export interface RoundTripResult {
  verified: boolean;
  fidelity: FidelityLevel;
  diffRegions: DiffRegion[];
}

/** Per-file entry in the import run report (FR-044). */
export interface FileReport {
  /** Original path of the foreign file (relative to foreignDir). */
  foreignPath: string;
  targetId: string;
  outcome: FileOutcome;
  roundTrip?: RoundTripResult;
  warnings: Warning[];
}

/** The complete per-run import report (FR-044, FR-029). */
export interface ImportReport {
  resolvedFormat: string;
  resolutionMethod: 'auto-detected' | 'explicitly-specified';
  files: FileReport[];
  portabilityWarnings: Warning[];
  allWarnings: Warning[];
  silentDropCount: number;
  preview: string[];
  dryRun: boolean;
  /**
   * Set when an explicit `--format` resolved an otherwise-ambiguous foreign layout
   * (AC-007). Records every candidate the layout would have matched, so an
   * override-of-ambiguity run is distinguishable from an unambiguous explicit run.
   */
  ambiguityResolvedByOverride?: { candidates: string[] };
}

/** Options for an import run. */
export interface ImportRunOptions {
  projectRoot: string;
  foreignDir?: string;
  format?: string;
  sourceDir?: string;
  dryRun?: boolean;
  overwrite?: boolean;
  /** Stdout stream theme used to style the pre-rendered preview (defaults to plain). */
  theme?: import('../cli/theme').Theme;
}

/** Neutralized representation of a single imported file, ready for source write. */
export interface NeutralizedFile {
  foreignPath: string;
  targetId: string;
  artifact: import('../domain/types').Artifact;
  overrides: Record<string, unknown>;
  defaultedChoices: string[];
  warnings: Warning[];
}
