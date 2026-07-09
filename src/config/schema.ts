import { z } from 'zod';
import { ARTIFACT_TYPES } from '../domain/types';

/**
 * Strict configuration schema. `.strict()` makes any unknown key a hard error so
 * a typo is rejected and reported rather than silently ignored (FR-030, AC-023).
 */
export const configSchema = z
  .object({
    /** Source-of-truth directory, relative to the project root. */
    source: z.string().min(1).optional(),
    /** Enabled target identifiers, or "all" for every registered target. */
    targets: z.union([z.literal('all'), z.array(z.string().min(1))]).optional(),
    /** Enabled artifact types; omitted means all four. */
    artifactTypes: z.array(z.enum(ARTIFACT_TYPES as [string, ...string[]])).optional(),
    /** Warn or error when a declared intent cannot be represented (lossy policy). */
    lossyPolicy: z.enum(['warn', 'error']).optional(),
    /** Backups retained per overwritten file (FR-049 default 3). */
    backupRetention: z.number().int().min(0).optional(),
  })
  .strict();

export type RawConfig = z.infer<typeof configSchema>;

export interface ConfigLoadError {
  ok: false;
  unknownKeys: string[];
  message: string;
}

export interface ConfigLoadOk {
  ok: true;
  config: RawConfig;
}

export type ConfigParseResult = ConfigLoadOk | ConfigLoadError;

/**
 * Parse one raw configuration object with the strict schema. Unknown keys are
 * collected and reported (FR-030); other schema failures are reported too.
 */
export function parseConfig(raw: unknown, sourceLabel: string): ConfigParseResult {
  const result = configSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, config: result.data };
  }
  const unknownKeys: string[] = [];
  const otherIssues: string[] = [];
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      unknownKeys.push(...(issue as any).keys);
    } else {
      const field = issue.path.join('.') || '(root)';
      otherIssues.push(`${field}: ${issue.message}`);
    }
  }
  const parts: string[] = [];
  if (unknownKeys.length > 0) {
    parts.push(`unknown key(s): ${unknownKeys.join(', ')}`);
  }
  if (otherIssues.length > 0) {
    parts.push(otherIssues.join('; '));
  }
  return {
    ok: false,
    unknownKeys,
    message: `Rejected configuration from ${sourceLabel}: ${parts.join('; ')}`,
  };
}
