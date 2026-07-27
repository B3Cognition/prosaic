import * as path from 'path';
import { resolveConfig } from '../config/resolve';
import { discover } from '../discovery/discover';
import { findArtifactById } from '../resolve/lookup';
import { ArtifactNotFoundError } from '../resolve/errors';
import { InspectionResult, InspectOptions } from './types';

/**
 * Discover-then-find-then-map-then-wrap: a fresh discovery pass (FR-005), an
 * exact case-sensitive lookup restricted to that pass (FR-006, FR-026), a
 * passthrough mapping to the neutral `InspectedArtifact` shape (FR-015,
 * FR-025), wrapped in an exhaustive try/catch so no exception ever crosses
 * the function boundary (FR-017, ADR-006).
 */
export function inspectArtifact(opts: InspectOptions): InspectionResult {
  try {
    const { effective: config } = resolveConfig(opts.projectRoot, opts.cli ?? {});
    const sourceRoot = path.resolve(opts.projectRoot, config.source);
    const discovery = discover(sourceRoot, opts.projectRoot);
    const artifact = findArtifactById(discovery.artifacts, opts.artifactId);

    return {
      ok: true,
      data: {
        id: artifact.id,
        type: artifact.type,
        frontmatter: artifact.frontmatter,
        body: artifact.body,
        bundleRoot: artifact.bundleRoot ? path.resolve(sourceRoot, artifact.bundleRoot) : null,
        resources: artifact.resources ?? [],
      },
    };
  } catch (e) {
    if (e instanceof ArtifactNotFoundError) {
      return {
        ok: false,
        errorKind: 'artifact-not-found',
        artifactId: e.artifactId,
        message: e.message,
      };
    }
    return { ok: false, errorKind: 'internal', message: (e as Error).message };
  }
}
