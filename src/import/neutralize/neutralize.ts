import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as TOML from '@iarna/toml';
import { Artifact, Frontmatter } from '../../domain/types';
import { TargetDescriptor } from '../../registry/descriptor';
import { Warning } from '../../domain/warnings';
import { parseArtifact } from '../../discovery/parse';
import { buildInverseMap, applyInverseMap } from './inverse-map';
import { stripInject } from './strip-inject';
import { recoverOverrides } from './recover-overrides';
import { reconstructType } from './reconstruct-type';
import { invertArgs } from './invert-args';
import { extractBody } from './extract-body';
import { consumeCompanion, primaryBaseName } from '../bundle/companion';
import { reassociateBundle } from '../bundle/reassociate';
import { slotFor } from '../../registry/descriptor';
import { ARTIFACT_TO_DEPLOYMENT } from '../../pipeline/stages/stage0-resolve';

export interface NeutralizeResult {
  artifact: Artifact;
  overrides: Record<string, unknown>;
  defaultedChoices: string[];
  warnings: Warning[];
}

/** Drop result when a file cannot produce a neutral artifact. */
export interface NeutralizeDropped {
  reason: string;
  warnings: Warning[];
}

export type NeutralizeOutcome =
  | { ok: true; result: NeutralizeResult }
  | { ok: false; dropped: NeutralizeDropped };

/**
 * Compose all inverse steps into exactly 1 neutral artifact per foreign file
 * (FR-009, FR-016, FR-024, FR-045, FR-079, FR-080, NFR-007).
 *
 * Steps:
 *  1. Parse the foreign file using the descriptor's format (defensive, fail-closed)
 *  2. Extract body field for structured formats
 *  3. Strip descriptor-injected keys
 *  4. Apply inverse map (concrete → neutral)
 *  5. Recover remaining unknown keys under overrides
 *  6. Reconstruct artifact type from directory convention
 *  7. Invert argument tokens to canonical neutral placeholder
 *  8. Consume companion files
 *  9. Re-associate bundle resources
 */
export function neutralize(
  fileAbs: string,
  fileRelToRoot: string,
  desc: TargetDescriptor,
  projectRoot: string,
): NeutralizeOutcome {
  const foreignPath = fileRelToRoot;
  const warnings: Warning[] = [];
  const defaultedChoices: string[] = [];

  // Step 1: Parse the file
  let rawContent: string;
  try {
    rawContent = fs.readFileSync(fileAbs, 'utf8');
  } catch (e) {
    const reason = `Could not read file "${foreignPath}": ${(e as Error).message}`;
    return {
      ok: false,
      dropped: {
        reason,
        warnings: [{ kind: 'malformed-frontmatter', artifact: foreignPath, message: reason }],
      },
    };
  }

  let concreteFm: Frontmatter = {};
  let rawBody = '';

  try {
    const parsed = parseFormat(rawContent, desc.format, foreignPath);
    concreteFm = parsed.frontmatter;
    rawBody = parsed.body;
  } catch (e) {
    const reason = `${(e as Error).message}`;
    return {
      ok: false,
      dropped: {
        reason,
        warnings: [{ kind: 'malformed-frontmatter', artifact: foreignPath, message: reason }],
      },
    };
  }

  // Step 2: Extract body field for structured formats
  const baseName = primaryBaseName(fileAbs, desc.extension);
  const extractResult = extractBody(concreteFm, rawBody, desc.bodyField, foreignPath);
  concreteFm = extractResult.frontmatter;
  let body = extractResult.body;
  warnings.push(...extractResult.warnings);

  // Step 3: Strip injected keys (before inverse map)
  const stripResult = stripInject(concreteFm, desc, foreignPath);
  concreteFm = stripResult.frontmatter;
  warnings.push(...stripResult.warnings);

  // Step 4: Apply inverse map (concrete → neutral)
  let inverseMap;
  try {
    inverseMap = buildInverseMap(desc);
  } catch (e) {
    const reason = `Cannot import from target "${desc.id}": ${(e as Error).message}`;
    return {
      ok: false,
      dropped: {
        reason,
        warnings: [{ kind: 'unrecognized-format', target: desc.id, artifact: foreignPath, message: reason }],
      },
    };
  }

  const { neutral, remaining } = applyInverseMap(concreteFm, inverseMap);

  // Step 5: Handle remaining concrete keys based on descriptor's passthrough rule.
  // For passthrough: '*' — all remaining keys came from neutral source via passthrough,
  //   keep them in neutral frontmatter (no overrides, no warning).
  // For passthrough: [list] — listed keys go to neutral; unlisted → overrides + warning (FR-013).
  const overrides: Record<string, unknown> = {};
  const passthroughRule = desc.frontmatter.passthrough;

  if (passthroughRule === '*') {
    // All remaining keys have neutral origin via the wildcard passthrough — keep as neutral.
    for (const [key, value] of Object.entries(remaining)) {
      neutral[key] = value;
    }
  } else {
    // Explicit passthrough list: keys not listed have no neutral origin → overrides (FR-013)
    const passthroughSet = new Set(passthroughRule);
    for (const [key, value] of Object.entries(remaining)) {
      if (passthroughSet.has(key)) {
        neutral[key] = value;
      } else {
        const recoverResult = recoverOverrides({ [key]: value }, desc.id, foreignPath);
        Object.assign(overrides, recoverResult.overrides);
        warnings.push(...recoverResult.warnings);
      }
    }
  }

  // Step 6: Reconstruct artifact type from directory convention
  const typeResult = reconstructType(fileRelToRoot, desc, foreignPath);
  const artifactType = typeResult.type;
  warnings.push(...typeResult.warnings);
  defaultedChoices.push(...typeResult.defaultedChoices);

  // Step 7: Invert argument tokens (only for command-type artifacts)
  const deploymentType = ARTIFACT_TO_DEPLOYMENT[artifactType];
  if (deploymentType === 'command' || artifactType === 'command') {
    const argsResult = invertArgs(body, desc.argumentToken, foreignPath);
    body = argsResult.body;
    warnings.push(...argsResult.warnings);
    defaultedChoices.push(...argsResult.defaultedChoices);
  }

  // Step 8: Consume companion files
  const companionResult = consumeCompanion(fileAbs, baseName, desc, foreignPath);
  warnings.push(...companionResult.warnings);
  // Companion data goes through overrides, not neutral keys (FR-077)
  for (const [k, v] of Object.entries(companionResult.recovered)) {
    if (!(k in overrides)) {
      overrides[k] = v;
    }
  }

  // Step 9: Re-associate bundle resources
  const deploySlot = slotFor(desc, deploymentType);
  const slotDirAbs = `${projectRoot}/${deploySlot.dir}`;
  const bundleResult = reassociateBundle(fileAbs, slotDirAbs, projectRoot, foreignPath);
  warnings.push(...bundleResult.warnings);

  // Build the neutral artifact identifier (source-relative path)
  const neutralId = buildNeutralId(artifactType, baseName);

  // Assemble neutral frontmatter: neutral keys first, then add overrides map if non-empty
  const frontmatter: Frontmatter = { ...neutral };
  if (Object.keys(overrides).length > 0) {
    frontmatter['overrides'] = { [desc.id]: overrides };
  }

  const artifact: Artifact = {
    id: neutralId,
    type: artifactType,
    frontmatter,
    body,
    sourcePath: neutralId,
    resources: bundleResult.resources.length > 0 ? bundleResult.resources : undefined,
    bundleRoot: bundleResult.resources.length > 0 ? `${artifactType}s/${baseName}` : undefined,
  };

  return { ok: true, result: { artifact, overrides, defaultedChoices, warnings } };
}

/** Build the source-relative path for the neutralized artifact. */
function buildNeutralId(type: string, baseName: string): string {
  const folder = `${type}s`;
  return `${folder}/${baseName}.md`;
}

/** Parse file content according to the descriptor's format. */
function parseFormat(
  content: string,
  format: string,
  foreignPath: string,
): { frontmatter: Frontmatter; body: string } {
  if (format === 'markdown') {
    const parsed = parseArtifact(content);
    // parseArtifact captures the blank separator line at the start of body; strip it
    // so re-deploy via renderMarkdown (which adds its own \n\n separator) is idempotent.
    const body = parsed.body.replace(/^\n/, '');
    return { frontmatter: parsed.frontmatter, body };
  }

  if (format === 'toml') {
    let doc: Record<string, unknown>;
    try {
      doc = TOML.parse(content) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`invalid TOML in "${foreignPath}": ${(e as Error).message}`);
    }
    return { frontmatter: doc as Frontmatter, body: '' };
  }

  if (format === 'yaml') {
    let doc: unknown;
    try {
      doc = yaml.load(content);
    } catch (e) {
      throw new Error(`invalid YAML in "${foreignPath}": ${(e as Error).message}`);
    }
    if (doc === null || doc === undefined) {
      return { frontmatter: {}, body: '' };
    }
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      throw new Error(`YAML document in "${foreignPath}" must be a mapping`);
    }
    return { frontmatter: doc as Frontmatter, body: '' };
  }

  throw new Error(`Unsupported format "${format}" for file "${foreignPath}"`);
}
