import { ArtifactType, ARTIFACT_TYPES } from '../domain/types';
import { RawConfig } from './schema';

/** Command-line selection overrides that replace file-configuration values. */
export interface CliOverrides {
  /** Replaces `targets`. */
  targets?: string[];
  /** Replaces `artifactTypes`. */
  artifactTypes?: string[];
  /** Replaces `source`. */
  source?: string;
  /** Replaces `lossyPolicy`. */
  lossyPolicy?: 'warn' | 'error';
}

/** Raised when a CLI override value is invalid (e.g. an unknown artifact type). */
export class CliOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliOverrideError';
  }
}

/**
 * Apply command-line overrides so each override replaces exactly one
 * corresponding file-configuration value (FR-032). Only keys explicitly present
 * on the command line replace their file value; absent flags leave the file
 * value untouched.
 */
export function applyCliOverrides(base: RawConfig, cli: CliOverrides): RawConfig {
  const out: RawConfig = { ...base };

  if (cli.source !== undefined) out.source = cli.source;

  if (cli.targets !== undefined) {
    out.targets = cli.targets.length === 1 && cli.targets[0] === 'all' ? 'all' : cli.targets;
  }

  if (cli.artifactTypes !== undefined) {
    for (const t of cli.artifactTypes) {
      if (!(ARTIFACT_TYPES as readonly string[]).includes(t)) {
        throw new CliOverrideError(`unknown artifact type "${t}"`);
      }
    }
    out.artifactTypes = cli.artifactTypes as ArtifactType[];
  }

  if (cli.lossyPolicy !== undefined) out.lossyPolicy = cli.lossyPolicy;

  return out;
}
