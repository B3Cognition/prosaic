import * as path from 'path';
import { GuardedFs } from '../write/guarded-fs';
import { BackupManager } from '../write/backup';
import { Manifest } from '../manifest/manifest';
import { Registry } from '../registry/registry';
import { builtinRegistry } from '../registry/builtin';
import { slotFor } from '../registry/descriptor';
import { DEPLOYMENT_TYPES } from '../domain/types';
import { Warning } from '../domain/warnings';
import { resolveConfig } from '../config/resolve';
import { CliOverrides } from '../config/cli-override';
import { RunPlan } from '../lifecycle/plan';
import { previewPlan } from '../lifecycle/dry-run';
import { planRevert, executeRevert } from '../lifecycle/revert';
import { validatePackages, resolveDeclaredPackage } from './validate';
import { enumeratePackageSource } from './enumerate';
import { planPackageDeploy } from './plan';
import { stagePackageWrites } from './stage';
import { commitPackageDeploy, PackageExecuteResult } from './commit';

export interface PackageDeployOptions {
  projectRoot: string;
  packageId: string;
  dryRun?: boolean;
  cli?: CliOverrides;
  /** Injectable registry (defaults to the built-in set); used by tests. */
  registry?: Registry;
}

export interface PackageDeployReport {
  dryRun: boolean;
  packageId: string;
  preview: string[];
  warnings: Warning[];
  created: number;
  overwritten: number;
  unchanged: number;
  removed: number;
  backedUp: number;
  plan: RunPlan;
}

/**
 * Orchestrate one package deployment (ADR-002): load+validate config, run the
 * cross-package/destination/source validation (T-002), resolve the requested
 * `packageId` (throwing `UnknownPackageError` before any enumeration/planning
 * when absent, FR-047), enumerate the package source (T-006), plan the
 * deployment (T-007), then either preview (dry-run, writing 0 files, FR-015)
 * or stage-then-commit (T-008/T-009).
 */
export function deployPackage(opts: PackageDeployOptions): PackageDeployReport {
  const fsGate = new GuardedFs(opts.projectRoot);
  const registry = opts.registry ?? builtinRegistry();
  const { effective: config } = resolveConfig(opts.projectRoot, opts.cli ?? {});

  const renderTargetDirs = renderTargetDestinationDirs(registry, opts.projectRoot);
  validatePackages(config.packages, opts.projectRoot, renderTargetDirs);

  const pkg = resolveDeclaredPackage(config.packages, opts.packageId);

  const enumerated = enumeratePackageSource(path.resolve(opts.projectRoot, pkg.sourceRoot));

  const manifest = Manifest.loadOrEmpty(fsGate);
  manifest.setRegistryVersion(registry.version().version);

  const plan = planPackageDeploy({
    fsGate,
    priorManifest: manifest,
    packageId: pkg.id,
    destinationRoot: pkg.destinationRoot,
    neutralFiles: enumerated.neutralFiles,
    runtimeFiles: enumerated.runtimeFiles,
  });

  const base = {
    dryRun: !!opts.dryRun,
    packageId: pkg.id,
    warnings: enumerated.warnings,
    plan,
  };

  if (opts.dryRun) {
    return {
      ...base,
      preview: previewPlan(plan, 'apply'),
      created: 0,
      overwritten: 0,
      unchanged: 0,
      removed: 0,
      backedUp: 0,
    };
  }

  const backups = new BackupManager(fsGate, config.backupRetention);
  stagePackageWrites(plan, fsGate, pkg.id);
  const result: PackageExecuteResult = commitPackageDeploy(plan, fsGate, manifest, backups, pkg.id);

  return { ...base, preview: [], ...result };
}

export interface PackageRevertOptions {
  projectRoot: string;
  packageId: string;
  dryRun?: boolean;
  cli?: CliOverrides;
}

export interface PackageRevertReport {
  dryRun: boolean;
  packageId: string;
  removed: number;
  preview: string[];
}

/**
 * Standalone package revert (Should-Have, FR-023, OQ-003): mirrors the
 * provenance-guarded revert behavior already provided for render-target
 * output, reusing `planRevert()`/`executeRevert()` verbatim with the
 * declared package's own id as the sole selection — removes exactly the
 * files recorded as belonging to that declared package, touching 0 Foreign
 * Paths (AC-011). A missing/corrupt manifest aborts with 0 files removed,
 * matching every other Provenance-Guarded Operation (FR-024).
 */
export function revertPackage(opts: PackageRevertOptions): PackageRevertReport {
  const fsGate = new GuardedFs(opts.projectRoot);
  const { effective: config } = resolveConfig(opts.projectRoot, opts.cli ?? {});

  // Resolve first so an unknown package id aborts before touching the manifest.
  resolveDeclaredPackage(config.packages, opts.packageId);

  const manifest = Manifest.load(fsGate);
  const plan = planRevert(manifest, [opts.packageId]);

  if (opts.dryRun) {
    return {
      dryRun: true,
      packageId: opts.packageId,
      removed: 0,
      preview: previewPlan(plan, 'revert'),
    };
  }

  const removed = executeRevert(plan, fsGate, manifest);
  return { dryRun: false, packageId: opts.packageId, removed, preview: [] };
}

/**
 * Every registered render target's effective destination directory, across
 * every deployment type. The project root itself is excluded: a target whose
 * slot is the bare project root (e.g. a root-level `AGENTS.md`) would
 * otherwise trivially "overlap" every possible destination, since every
 * legal destinationRoot is structurally required to nest inside the project
 * root anyway (FR-026) — that containment is not the sibling-overlap FR-048
 * guards against.
 */
function renderTargetDestinationDirs(registry: Registry, projectRoot: string): string[] {
  const root = path.resolve(projectRoot);
  const dirs: string[] = [];
  for (const descriptor of registry.all()) {
    for (const dt of DEPLOYMENT_TYPES) {
      const resolved = path.resolve(projectRoot, slotFor(descriptor, dt).dir);
      if (resolved !== root) dirs.push(resolved);
    }
  }
  return dirs;
}
