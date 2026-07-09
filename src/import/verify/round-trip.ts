import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import * as TOML from '@iarna/toml';
import { Artifact, Frontmatter } from '../../domain/types';
import { TargetDescriptor } from '../../registry/descriptor';
import { Warning } from '../../domain/warnings';
import { runPipeline } from '../../pipeline/runner';
import { RoundTripResult, DiffRegion, FidelityLevel } from '../types';

/**
 * Re-deploy the reconstructed artifact through the forward pipeline using the
 * same descriptor, then compare byte-for-byte against the original foreign content
 * (FR-036, FR-037, FR-038, FR-039, FR-040, FR-070, FR-071, NFR-001).
 */
export function roundTrip(
  artifact: Artifact,
  desc: TargetDescriptor,
  originalContent: string,
  foreignPath: string,
): { result: RoundTripResult; warnings: Warning[] } {
  const warnings: Warning[] = [];

  let redeployed: string;
  try {
    const output = runPipeline(artifact, desc, { lossyPolicy: 'warn' });
    redeployed = output.content;
    warnings.push(...output.warnings);
  } catch (e) {
    warnings.push({
      kind: 'round-trip-mismatch',
      artifact: foreignPath,
      message: `Round-trip re-deploy failed: ${(e as Error).message}`,
    });
    return {
      result: {
        verified: false,
        fidelity: 'mismatch',
        diffRegions: [{ original: originalContent, redeployed: '' }],
      },
      warnings,
    };
  }

  // FR-036: byte-for-byte SHA256 comparison
  const hashOriginal = sha256(originalContent);
  const hashRedeployed = sha256(redeployed);

  if (hashOriginal === hashRedeployed) {
    return {
      result: { verified: true, fidelity: 'fully-invertible', diffRegions: [] },
      warnings,
    };
  }

  // Byte diff: check normalized equivalence (FR-039)
  const normalizedOriginal = normalizeContent(originalContent, desc);
  const normalizedRedeployed = normalizeContent(redeployed, desc);

  if (sha256(normalizedOriginal) === sha256(normalizedRedeployed)) {
    return {
      result: { verified: false, fidelity: 'normalized-equivalent', diffRegions: [] },
      warnings,
    };
  }

  // Genuine mismatch: record differing regions (FR-070, FR-071)
  const diffRegions = computeDiffRegions(originalContent, redeployed);
  warnings.push({
    kind: 'round-trip-mismatch',
    artifact: foreignPath,
    message:
      `Round-trip mismatch for "${foreignPath}": re-deployed output differs from original. ` +
      `${diffRegions.length} differing region(s) identified.`,
  });

  return {
    result: { verified: false, fidelity: 'mismatch', diffRegions },
    warnings,
  };
}

/**
 * Determine the per-target fidelity level based on what the round-trip revealed
 * and whether the artifact has overrides (FR-020, FR-023).
 */
export function fidelityLevel(
  roundTripResult: RoundTripResult,
  hasOverrides: boolean,
): FidelityLevel {
  if (roundTripResult.verified) {
    return hasOverrides ? 'invertible-with-overrides' : 'fully-invertible';
  }
  return roundTripResult.fidelity;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Normalize content for semantic equivalence check: parse and re-serialize
 * with canonical key ordering and whitespace (FR-039).
 */
function normalizeContent(content: string, desc: TargetDescriptor): string {
  if (desc.format === 'toml') {
    try {
      const doc = TOML.parse(content);
      return TOML.stringify(doc as TOML.JsonMap);
    } catch {
      return content;
    }
  }
  if (desc.format === 'yaml') {
    try {
      const doc = yaml.load(content);
      return yaml.dump(doc, { sortKeys: true, lineWidth: -1 });
    } catch {
      return content;
    }
  }
  // Markdown: normalize whitespace and frontmatter key order
  return content.trim().replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
}

function computeDiffRegions(original: string, redeployed: string): DiffRegion[] {
  const origLines = original.split('\n');
  const redepLines = redeployed.split('\n');
  const regions: DiffRegion[] = [];

  const maxLen = Math.max(origLines.length, redepLines.length);
  let inRegion = false;
  let regionOrig: string[] = [];
  let regionRedep: string[] = [];

  const flush = () => {
    if (inRegion) {
      regions.push({
        original: regionOrig.join('\n'),
        redeployed: regionRedep.join('\n'),
      });
      regionOrig = [];
      regionRedep = [];
      inRegion = false;
    }
  };

  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i] ?? '';
    const r = redepLines[i] ?? '';
    if (o !== r) {
      inRegion = true;
      regionOrig.push(o);
      regionRedep.push(r);
    } else {
      flush();
    }
  }
  flush();
  return regions;
}
