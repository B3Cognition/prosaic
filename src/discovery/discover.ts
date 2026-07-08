import * as fs from 'fs';
import * as path from 'path';
import { Artifact, ResourceFile } from '../domain/types';
import { Warning } from '../domain/warnings';
import { walkSource, WalkedFile } from './walk';
import { parseArtifact, ParseError } from './parse';
import { classify } from './classify';
import { validateFrontmatter } from './schemas';
import { dropWarning } from './drop-and-warn';
import { emptyRunReport, EmptyRunReport } from './empty-run';

export interface DiscoveryResult {
  artifacts: Artifact[];
  warnings: Warning[];
  report: EmptyRunReport;
}

/** Top-level folders whose nested directories form skill/subagent bundles. */
const BUNDLE_TYPE_FOLDERS = new Set([
  'skills',
  'skill',
  'subagents',
  'subagent',
  'agents',
  'agent',
]);

/** Preferred primary file names inside a bundle directory. */
const PRIMARY_NAMES = ['SKILL.md', 'AGENT.md', 'SUBAGENT.md', 'index.md', 'README.md'];

/**
 * Discover, parse, classify, and validate every artifact in the source of truth.
 * Skill/subagent bundles are grouped first so a bundle's resource files are never
 * also discovered as standalone artifacts. One malformed or schema-failing file
 * is dropped with a warning; the run continues for every valid artifact (FR-004,
 * FR-005, FR-052, FR-057, NFR-010).
 */
export function discover(sourceRoot: string, projectRoot: string): DiscoveryResult {
  const files = walkSource(sourceRoot, projectRoot);
  const warnings: Warning[] = [];
  const artifacts: Artifact[] = [];

  const { bundles, standalone } = partitionBundles(files);

  for (const [bundleRel, group] of bundles) {
    const built = buildBundle(bundleRel, group, warnings);
    if (built) artifacts.push(built);
  }

  for (const file of standalone) {
    const built = buildStandalone(file, warnings);
    if (built) artifacts.push(built);
  }

  artifacts.sort((a, b) => a.id.localeCompare(b.id));
  return { artifacts, warnings, report: emptyRunReport(artifacts) };
}

/** The bundle directory (source-relative) a file belongs to, or null. */
function bundleDirOf(rel: string): string | null {
  const parts = rel.split('/');
  if (parts.length < 3) return null; // need <typeFolder>/<name>/<file...>
  if (!BUNDLE_TYPE_FOLDERS.has(parts[0].toLowerCase())) return null;
  return `${parts[0]}/${parts[1]}`;
}

/** Split walked files into bundle groups and standalone files. */
function partitionBundles(files: WalkedFile[]): {
  bundles: Map<string, WalkedFile[]>;
  standalone: WalkedFile[];
} {
  const bundles = new Map<string, WalkedFile[]>();
  const standalone: WalkedFile[] = [];
  for (const file of files) {
    const dir = bundleDirOf(file.rel);
    if (dir) {
      const g = bundles.get(dir) ?? [];
      g.push(file);
      bundles.set(dir, g);
    } else {
      standalone.push(file);
    }
  }
  return { bundles, standalone };
}

/** Choose the primary .md among a bundle's direct children. */
function pickPrimary(bundleRel: string, group: WalkedFile[]): WalkedFile | undefined {
  const directChildren = group.filter((f) => path.posix.dirname(f.rel) === bundleRel);
  const byName = (name: string) =>
    directChildren.find((f) => path.posix.basename(f.rel).toLowerCase() === name.toLowerCase());
  for (const preferred of PRIMARY_NAMES) {
    const hit = byName(preferred);
    if (hit) return hit;
  }
  const md = directChildren.filter((f) => f.rel.toLowerCase().endsWith('.md'));
  return md.length === 1 ? md[0] : md[0]; // deterministic: first direct .md
}

function buildBundle(
  bundleRel: string,
  group: WalkedFile[],
  warnings: Warning[],
): Artifact | null {
  const primary = pickPrimary(bundleRel, group);
  if (!primary) return null;

  let raw: string;
  try {
    raw = fs.readFileSync(primary.abs, 'utf8');
  } catch (e) {
    warnings.push(dropWarning('malformed-frontmatter', primary.rel, `unreadable: ${(e as Error).message}`));
    return null;
  }

  let parsed;
  try {
    parsed = parseArtifact(raw);
  } catch (e) {
    if (e instanceof ParseError) {
      warnings.push(dropWarning('malformed-frontmatter', primary.rel, e.message));
      return null;
    }
    throw e;
  }

  const cls = classify(primary.rel, parsed.frontmatter);
  if (!cls.ok) {
    warnings.push(dropWarning('classification', primary.rel, cls.reason));
    return null;
  }

  const schema = validateFrontmatter(cls.type, parsed.frontmatter);
  if (!schema.ok) {
    warnings.push(dropWarning('schema-invalid', primary.rel, `field "${schema.field}": ${schema.reason}`));
    return null;
  }

  const resources: ResourceFile[] = group
    .filter((f) => f.abs !== primary.abs)
    .map((f) => ({
      relPath: path.relative(bundleRel, f.rel).split(path.sep).join('/'),
      content: fs.readFileSync(f.abs, 'utf8'),
    }))
    .sort((a, b) => a.relPath.localeCompare(b.relPath));

  return {
    id: primary.rel,
    type: cls.type,
    frontmatter: schema.frontmatter,
    body: parsed.body,
    sourcePath: primary.rel,
    bundleRoot: bundleRel,
    resources,
  };
}

function buildStandalone(file: WalkedFile, warnings: Warning[]): Artifact | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file.abs, 'utf8');
  } catch (e) {
    warnings.push(dropWarning('malformed-frontmatter', file.rel, `unreadable: ${(e as Error).message}`));
    return null;
  }

  let parsed;
  try {
    parsed = parseArtifact(raw);
  } catch (e) {
    if (e instanceof ParseError) {
      warnings.push(dropWarning('malformed-frontmatter', file.rel, e.message));
      return null;
    }
    throw e;
  }

  const cls = classify(file.rel, parsed.frontmatter);
  if (!cls.ok) {
    warnings.push(dropWarning('classification', file.rel, cls.reason));
    return null;
  }

  const schema = validateFrontmatter(cls.type, parsed.frontmatter);
  if (!schema.ok) {
    warnings.push(dropWarning('schema-invalid', file.rel, `field "${schema.field}": ${schema.reason}`));
    return null;
  }

  return {
    id: file.rel,
    type: cls.type,
    frontmatter: schema.frontmatter,
    body: parsed.body,
    sourcePath: file.rel,
  };
}
