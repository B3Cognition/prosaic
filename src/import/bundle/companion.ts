import * as fs from 'fs';
import * as path from 'path';
import { Frontmatter } from '../../domain/types';
import { TargetDescriptor } from '../../registry/descriptor';
import { Warning } from '../../domain/warnings';

export interface CompanionConsumeResult {
  /** Data recovered from the companion file, merged into frontmatter. */
  recovered: Frontmatter;
  warnings: Warning[];
}

/**
 * Consume exactly 1 companion file per foreign prose file and recover 100% of
 * its data (FR-042, FR-076, FR-077).
 *
 * The companion is identified by the descriptor's companion nameTemplate with
 * the primary file's base name substituted. Companion data is recovered into
 * the neutral artifact; 0 companion-only fields are emitted as neutral keys
 * (they go to overrides via the normal recover path).
 */
export function consumeCompanion(
  primaryAbsPath: string,
  primaryBaseName: string,
  desc: TargetDescriptor,
  foreignPath: string,
): CompanionConsumeResult {
  const companionRules = desc.companions ?? [];
  if (companionRules.length === 0) {
    return { recovered: {}, warnings: [] };
  }

  const primaryDir = path.dirname(primaryAbsPath);
  const warnings: Warning[] = [];
  const recovered: Frontmatter = {};

  for (const rule of companionRules) {
    const companionName = rule.nameTemplate.split('{name}').join(primaryBaseName);
    const companionAbs = path.join(primaryDir, companionName);

    if (!fs.existsSync(companionAbs)) continue;

    let content: string;
    try {
      content = fs.readFileSync(companionAbs, 'utf8');
    } catch (e) {
      warnings.push({
        kind: 'malformed-frontmatter',
        artifact: foreignPath,
        message: `Could not read companion file "${companionAbs}": ${(e as Error).message}`,
      });
      continue;
    }

    // Parse companion content — support JSON companions (like github-copilot's .metadata.json)
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // Non-JSON companion: store as raw string
      parsed = { _companionContent: content };
    }

    // Recover companion data (it will go through the overrides path, not neutral keys)
    for (const [k, v] of Object.entries(parsed)) {
      recovered[k] = v;
    }
  }

  return { recovered, warnings };
}

/** Derive the base name from a primary file path (no extension, no directory). */
export function primaryBaseName(absPath: string, extension: string): string {
  const base = path.basename(absPath);
  if (base.endsWith(extension)) {
    return base.slice(0, -extension.length);
  }
  return path.parse(base).name;
}
