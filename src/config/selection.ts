import { ArtifactType, ARTIFACT_TYPES } from '../domain/types';
import { RawConfig } from './schema';
import { PackageDeclaration } from '../package/types';

/** The fully-resolved, effective run configuration (FR-029). */
export interface EffectiveConfig {
  source: string;
  /** "all" means every registered target; otherwise an explicit id list. */
  targets: 'all' | string[];
  artifactTypes: ArtifactType[];
  lossyPolicy: 'warn' | 'error';
  backupRetention: number;
  /** Declared packages (FR-001); empty when the project declares none (FR-004). */
  packages: PackageDeclaration[];
}

export const DEFAULT_SOURCE = '.prosaic';
export const DEFAULT_BACKUP_RETENTION = 3;

/**
 * Produce the single effective run configuration from a merged file config plus
 * defaults (FR-029). Selecting zero targets or zero artifact types is legal and
 * yields a no-op run downstream (FR-054).
 */
export function toEffective(merged: RawConfig): EffectiveConfig {
  return {
    source: merged.source ?? DEFAULT_SOURCE,
    targets: merged.targets ?? 'all',
    artifactTypes: (merged.artifactTypes as ArtifactType[]) ?? [...ARTIFACT_TYPES],
    lossyPolicy: merged.lossyPolicy ?? 'warn',
    backupRetention: merged.backupRetention ?? DEFAULT_BACKUP_RETENTION,
    packages: (merged.packages as PackageDeclaration[] | undefined) ?? [],
  };
}

/** True when the effective configuration selects zero targets (no-op, FR-054, AC-035). */
export function selectsZeroTargets(cfg: EffectiveConfig): boolean {
  return Array.isArray(cfg.targets) && cfg.targets.length === 0;
}

/** True when the effective configuration enables the given artifact type (FR-060). */
export function typeEnabled(cfg: EffectiveConfig, type: ArtifactType): boolean {
  return cfg.artifactTypes.includes(type);
}
