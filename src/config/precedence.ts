import * as path from 'path';
import { RawConfig } from './schema';
import { loadConfigFile, ConfigSource } from './load';

/**
 * Resolve configuration from three sources — global, ancestor-directory, and
 * project-level — merging in a fixed precedence where project overrides ancestor
 * and ancestor overrides global (FR-031). Later sources win key-by-key.
 */
export function resolvePrecedence(
  projectRoot: string,
  globalDir?: string,
): { merged: RawConfig; sources: ConfigSource[] } {
  const sources: ConfigSource[] = [];

  // Global (lowest precedence).
  if (globalDir) {
    const g = loadConfigFile(globalDir);
    if (g) sources.push({ ...g, label: `global:${g.label}` });
  }

  // Ancestor directories between the filesystem root and the project's parent,
  // ordered farthest-ancestor first so nearer ancestors override farther ones.
  const ancestors = ancestorDirs(projectRoot);
  for (const dir of ancestors) {
    const a = loadConfigFile(dir);
    if (a) sources.push({ ...a, label: `ancestor:${a.label}` });
  }

  // Project-level (highest precedence).
  const proj = loadConfigFile(projectRoot);
  if (proj) sources.push({ ...proj, label: `project:${proj.label}` });

  const merged = sources.reduce<RawConfig>((acc, s) => mergeConfig(acc, s.config), {});
  return { merged, sources };
}

/** Directories strictly above the project root, farthest first. */
function ancestorDirs(projectRoot: string): string[] {
  const out: string[] = [];
  let cur = path.dirname(path.resolve(projectRoot));
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // Farthest ancestor first (lowest precedence among ancestors).
  return out.reverse();
}

/** Shallow key-wise merge where `override` wins for any present key. */
export function mergeConfig(base: RawConfig, override: RawConfig): RawConfig {
  const out: RawConfig = { ...base };
  for (const key of Object.keys(override) as (keyof RawConfig)[]) {
    const v = override[key];
    if (v !== undefined) {
      (out as any)[key] = v;
    }
  }
  return out;
}
