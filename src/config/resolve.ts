import { resolvePrecedence } from './precedence';
import { applyCliOverrides, CliOverrides } from './cli-override';
import { toEffective, EffectiveConfig } from './selection';
import { ConfigSource } from './load';

export interface ResolvedConfig {
  effective: EffectiveConfig;
  sources: ConfigSource[];
}

/**
 * Resolve the single effective run configuration (FR-029): merge file sources by
 * precedence (FR-031), apply command-line overrides (FR-032), then materialize
 * defaults. Any rejected source (unknown key) throws upstream (FR-030).
 */
export function resolveConfig(
  projectRoot: string,
  cli: CliOverrides = {},
  globalDir?: string,
): ResolvedConfig {
  const { merged, sources } = resolvePrecedence(projectRoot, globalDir);
  const withCli = applyCliOverrides(merged, cli);
  return { effective: toEffective(withCli), sources };
}
