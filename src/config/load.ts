import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { parseConfig, RawConfig } from './schema';

/** Config file name searched at project, ancestor, and global scopes. */
export const CONFIG_FILENAMES = ['prosaic.config.yaml', 'prosaic.config.yml', '.prosaic.yaml'];

/** Raised when a configuration source is rejected (FR-030, AC-023). */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly unknownKeys: string[] = [],
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface ConfigSource {
  label: string;
  config: RawConfig;
}

/**
 * Read and strictly parse a single configuration file. Returns null when no file
 * exists at `dir`. Throws ConfigError when the file exists but is rejected —
 * unknown keys are reported rather than ignored (FR-030).
 */
export function loadConfigFile(dir: string): ConfigSource | null {
  for (const name of CONFIG_FILENAMES) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    let doc: unknown;
    try {
      doc = yaml.load(raw) ?? {};
    } catch (e) {
      throw new ConfigError(`Configuration ${p} is not valid YAML: ${(e as Error).message}`);
    }
    const parsed = parseConfig(doc, p);
    if (!parsed.ok) {
      throw new ConfigError(parsed.message, parsed.unknownKeys);
    }
    return { label: p, config: parsed.config };
  }
  return null;
}
