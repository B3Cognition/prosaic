import * as path from 'path';
import { Warning } from '../../domain/warnings';
import { Frontmatter } from '../../domain/types';

/** Best-practice remediation for absolute/escaping paths (FR-027). */
const REMEDIATION_ABSOLUTE =
  'Use a path relative to the project root instead of an absolute path, ' +
  'or reference a resource by name without a filesystem path.';

/** Best-practice remediation for project-relative paths (FR-027). */
const REMEDIATION_RELATIVE =
  'Project-relative paths may not resolve after distribution to other targets or machines. ' +
  'Consider embedding the content inline or referencing a public URL if the resource must travel.';

export interface PathWarning extends Warning {
  remediation: string;
}

/**
 * Classify a string value as a path reference and emit the appropriate portability
 * warning (FR-025, FR-026, FR-027). Returns null when the value is not a path.
 */
export function classifyPathValue(
  value: string,
  fieldName: string,
  artifactPath: string,
): PathWarning | null {
  if (!looksLikePath(value)) return null;

  if (path.isAbsolute(value) || isEscaping(value)) {
    return {
      kind: 'portability',
      artifact: artifactPath,
      message: `Field "${fieldName}" contains an absolute or root-escaping path: "${value}".`,
      remediation: REMEDIATION_ABSOLUTE,
    };
  }

  if (isProjectRelative(value)) {
    return {
      kind: 'portability',
      artifact: artifactPath,
      message: `Field "${fieldName}" contains a project-relative path: "${value}". ` +
        `This path may not resolve after distribution to other targets.`,
      remediation: REMEDIATION_RELATIVE,
    };
  }

  return null;
}

/**
 * Scan all frontmatter values and the body for path references, emitting
 * portability warnings for each one found (FR-025, FR-026, FR-027).
 * Every warning carries a non-empty remediation (FR-027).
 */
export function scanPortabilityIssues(
  frontmatter: Frontmatter,
  body: string,
  artifactPath: string,
): PathWarning[] {
  const warnings: PathWarning[] = [];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === 'string') {
      const w = classifyPathValue(value, key, artifactPath);
      if (w) warnings.push(w);
    }
  }

  // Scan body for path-like references in lines
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // Look for markdown links, code references, or bare paths
    const pathRefs = extractPathRefs(trimmed);
    for (const ref of pathRefs) {
      const w = classifyPathValue(ref, 'body', artifactPath);
      if (w) warnings.push(w);
    }
  }

  return warnings;
}

function looksLikePath(value: string): boolean {
  // Exclude URLs — they are not filesystem paths
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
  // Absolute: starts with / or C:\ etc.
  if (path.isAbsolute(value)) return true;
  // Relative with path separator components
  if (value.startsWith('./') || value.startsWith('../') || value.includes('/')) return true;
  return false;
}

function isEscaping(value: string): boolean {
  const normalized = path.normalize(value);
  return normalized.startsWith('..');
}

function isProjectRelative(value: string): boolean {
  return value.startsWith('./') || (!path.isAbsolute(value) && value.includes('/'));
}

function extractPathRefs(line: string): string[] {
  const refs: string[] = [];
  // Markdown image/link: ![alt](path)
  const mdLinks = [...line.matchAll(/\[.*?\]\(([^)]+)\)/g)];
  for (const m of mdLinks) refs.push(m[1]);
  // Bare paths: sequences starting with ./ or / or ../
  const barePaths = [...line.matchAll(/((?:\.\.\/|\.\/|\/)[^\s"'`]+)/g)];
  for (const m of barePaths) refs.push(m[1]);
  return refs;
}
