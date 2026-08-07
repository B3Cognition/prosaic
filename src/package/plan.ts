import * as fs from 'fs';
import * as path from 'path';
import { GuardedFs } from '../write/guarded-fs';
import { Manifest } from '../manifest/manifest';
import { sha256 } from '../manifest/integrity';
import { planReconcile, reconcileKey } from '../lifecycle/planner';
import { RunPlan, PlannedWrite } from '../lifecycle/plan';
import { EnumeratedFile } from './enumerate';

export interface PlanPackageDeployContext {
  fsGate: GuardedFs;
  /** The manifest from the prior deployment (provenance + reconciliation). */
  priorManifest: Manifest;
  packageId: string;
  /** Deployment destination root, project-relative. */
  destinationRoot: string;
  neutralFiles: EnumeratedFile[];
  runtimeFiles: EnumeratedFile[];
}

/**
 * Compute a package deployment's run plan (ADR-005/010): classify every
 * enumerated file (T-006) as create/overwrite/unchanged using the identical
 * content-hash comparison rule already used for render-target classification
 * (AC-040), then reconcile-on-produce via the existing, unmodified
 * `planReconcile()` keyed by `target = packageId` (ADR-005) — combined with the
 * write-side states this yields exactly 4 total classification states (FR-017,
 * AC-007, AC-039). A path recorded under any other package, render target, or
 * no record at all (a Foreign Path) is never targeted for a content-changing
 * write (FR-022, AC-009).
 */
export function planPackageDeploy(ctx: PlanPackageDeployContext): RunPlan {
  const { fsGate, priorManifest, packageId, destinationRoot, neutralFiles, runtimeFiles } = ctx;

  const writes: PlannedWrite[] = [];
  const producedKeys = new Set<string>();

  for (const file of [...neutralFiles, ...runtimeFiles]) {
    const destPath = destinationPath(destinationRoot, file.relPath);
    const planned = classifyPackageWrite(packageId, destPath, file, fsGate, priorManifest);
    producedKeys.add(reconcileKey(packageId, destPath));
    if (planned) writes.push(planned);
  }

  const removals = planReconcile(priorManifest, producedKeys, new Set([packageId]));

  return { writes, removals, warnings: [] };
}

function classifyPackageWrite(
  packageId: string,
  destPath: string,
  file: EnumeratedFile,
  fsGate: GuardedFs,
  priorManifest: Manifest,
): PlannedWrite | null {
  const content: Buffer = fs.readFileSync(file.absPath);
  const hash = sha256(content);
  const base: Omit<PlannedWrite, 'changeType' | 'backupNeeded'> = {
    targetId: packageId,
    path: destPath,
    content,
    hash,
    ...(file.mode !== undefined ? { mode: file.mode } : {}),
  };

  if (!fsGate.exists(destPath)) {
    return { ...base, changeType: 'create', backupNeeded: false };
  }

  const existing = fsGate.readFileBuffer(destPath);
  const existingHash = sha256(existing);
  const managed = priorManifest.isManaged(packageId, destPath);

  if (existingHash === hash) {
    return { ...base, changeType: 'unchanged', backupNeeded: false };
  }

  if (!managed) {
    // Content-changing write to a Foreign Path → refuse (FR-022, AC-009).
    return null;
  }

  return { ...base, changeType: 'overwrite', backupNeeded: true };
}

function destinationPath(destinationRoot: string, relPath: string): string {
  const posixRoot = destinationRoot.split(path.sep).join('/');
  return path.posix.join(posixRoot, relPath);
}
