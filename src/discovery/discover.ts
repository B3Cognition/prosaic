import * as fs from 'fs';
import * as path from 'path';
import { Artifact, ArtifactType, ResourceFile } from '../domain/types';
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

/** Bundle types that may carry resource files in a directory. */
const BUNDLE_TYPES = new Set<ArtifactType>(['skill', 'subagent']);

/** Preferred primary file names inside a bundle directory. */
const PRIMARY_NAMES = ['SKILL.md', 'AGENT.md', 'SUBAGENT.md', 'index.md', 'README.md'];

/**
 * Discover, parse, classify, and validate every artifact in the source of truth.
 * One malformed or schema-failing file is dropped with a warning; the run
 * continues for every valid artifact (FR-004, FR-005, FR-052, FR-057, NFR-010).
 * Skill/subagent bundles collect their sibling files as resources (FR-012 input).
 */
export function discover(sourceRoot: string, projectRoot: string): DiscoveryResult {
  const files = walkSource(sourceRoot, projectRoot);
  const warnings: Warning[] = [];
  const artifacts: Artifact[] = [];

  // Track which files were consumed as bundle resources so they are not also
  // discovered as standalone artifacts.
  const consumed = new Set<string>();

  for (const file of files) {
    if (consumed.has(file.abs)) continue;

    const built = buildArtifact(file, sourceRoot, files, consumed, warnings);
    if (built) artifacts.push(built);
  }

  artifacts.sort((a, b) => a.id.localeCompare(b.id));
  return { artifacts, warnings, report: emptyRunReport(artifacts) };
}

function buildArtifact(
  file: WalkedFile,
  sourceRoot: string,
  allFiles: WalkedFile[],
  consumed: Set<string>,
  warnings: Warning[],
): Artifact | null {
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
    warnings.push(
      dropWarning('schema-invalid', file.rel, `field "${schema.field}": ${schema.reason}`),
    );
    return null;
  }

  const artifact: Artifact = {
    id: file.rel,
    type: cls.type,
    frontmatter: schema.frontmatter,
    body: parsed.body,
    sourcePath: file.rel,
  };

  // A bundle-type artifact whose primary file lives in a nested directory
  // (e.g. skills/foo/SKILL.md) collects sibling files as resources.
  if (BUNDLE_TYPES.has(cls.type) && isBundlePrimary(file, sourceRoot)) {
    const bundleDir = path.dirname(file.abs);
    const resources = collectResources(bundleDir, file.abs, allFiles, consumed);
    artifact.bundleRoot = path.relative(sourceRoot, bundleDir).split(path.sep).join('/');
    artifact.resources = resources;
  }

  return artifact;
}

/** True when this file is the primary file of a bundle directory. */
function isBundlePrimary(file: WalkedFile, sourceRoot: string): boolean {
  const bundleDir = path.dirname(file.abs);
  // The top-level type folder itself is not a bundle dir (e.g. skills/foo.md).
  const relDir = path.relative(sourceRoot, bundleDir);
  if (relDir === '' || relDir === '.') return false;
  const topDir = relDir.split(path.sep)[0].toLowerCase();
  const isTypeFolder = ['skills', 'skill', 'subagents', 'subagent', 'agents', 'agent'].includes(
    topDir,
  );
  if (!isTypeFolder) return false;
  // The bundle dir must be at least one level below the type folder.
  return relDir.split(path.sep).length >= 2;
}

/** Collect all non-primary files under a bundle directory as resources. */
function collectResources(
  bundleDir: string,
  primaryAbs: string,
  allFiles: WalkedFile[],
  consumed: Set<string>,
): ResourceFile[] {
  const resources: ResourceFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (abs === primaryAbs) continue;
      consumed.add(abs);
      resources.push({
        relPath: path.relative(bundleDir, abs).split(path.sep).join('/'),
        content: fs.readFileSync(abs, 'utf8'),
      });
    }
  };
  walk(bundleDir);
  // Also mark other discovered markdown primaries within the bundle as consumed.
  for (const f of allFiles) {
    if (f.abs !== primaryAbs && f.abs.startsWith(bundleDir + path.sep)) {
      consumed.add(f.abs);
    }
  }
  resources.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return resources;
}

/** Choose the primary file among candidates in a bundle directory. */
export function preferredPrimary(names: string[]): string | undefined {
  for (const preferred of PRIMARY_NAMES) {
    const hit = names.find((n) => n.toLowerCase() === preferred.toLowerCase());
    if (hit) return hit;
  }
  const md = names.filter((n) => n.toLowerCase().endsWith('.md'));
  return md.length === 1 ? md[0] : undefined;
}
