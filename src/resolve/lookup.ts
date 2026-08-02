import * as path from 'path';
import { Artifact } from '../domain/types';
import { builtinRegistry } from '../registry/builtin';
import { UnknownTargetError } from '../registry/registry';
import { resolveConfig } from '../config/resolve';
import { discover } from '../discovery/discover';
import { ArtifactNotFoundError } from './errors';
import { resolveExecution } from './resolve-execution';
import { ResolveExecutionResult, ResolveOptions } from './types';

/** Find an artifact by id among discovered artifacts, or throw (FR-008). */
export function findArtifactById(artifacts: Artifact[], artifactId: string): Artifact {
  const found = artifacts.find((a) => a.id === artifactId);
  if (!found) throw new ArtifactNotFoundError(artifactId);
  return found;
}

/**
 * Resolve one artifact-target pair's execution data end-to-end: discover the
 * artifact, look up the target, then compute via `resolveExecution()` (ADR-003).
 * Never throws — every failure path returns an identifiable `errorKind`
 * (FR-007, FR-008, NFR-001).
 */
export function resolveExecutionData(opts: ResolveOptions): ResolveExecutionResult {
  try {
    const registry = opts.registry ?? builtinRegistry();
    const descriptor = registry.get(opts.targetId);

    const { effective: config } = resolveConfig(opts.projectRoot, opts.cli ?? {});
    const sourceRoot = path.resolve(opts.projectRoot, config.source);
    const discovery = discover(sourceRoot, opts.projectRoot);
    const artifact = findArtifactById(discovery.artifacts, opts.artifactId);

    const data = resolveExecution(artifact, descriptor);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof UnknownTargetError) {
      return {
        ok: false,
        errorKind: 'unregistered-target',
        targetId: e.targetId,
        message: e.message,
      };
    }
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
