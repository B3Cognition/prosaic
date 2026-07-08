import * as path from 'path';
import { GuardedFs } from '../write/guarded-fs';
import { BackupManager } from '../write/backup';
import { Manifest } from '../manifest/manifest';
import { Registry } from '../registry/registry';
import { builtinRegistry } from '../registry/builtin';
import { resolveConfig } from '../config/resolve';
import { CliOverrides } from '../config/cli-override';
import { selectsZeroTargets } from '../config/selection';
import { discover } from '../discovery/discover';
import { Warning } from '../domain/warnings';
import { planApply } from './planner';
import { planRevert, executeRevert } from './revert';
import { executeApply } from './executor';
import { previewPlan } from './dry-run';
import { changedFileCount } from './no-op-detect';
import { RunPlan } from './plan';

export interface RunOptions {
  projectRoot: string;
  cli?: CliOverrides;
  dryRun?: boolean;
  globalDir?: string;
  /** Injectable registry (defaults to the built-in set); used by tests. */
  registry?: Registry;
}

export interface ApplyReport {
  dryRun: boolean;
  empty: boolean;
  zeroTargets: boolean;
  warnings: Warning[];
  preview: string[];
  changedFiles: number;
  created: number;
  overwritten: number;
  unchanged: number;
  removed: number;
  backedUp: number;
  plan: RunPlan;
}

export interface RevertReport {
  dryRun: boolean;
  removed: number;
  preview: string[];
  plan: RunPlan;
}

/**
 * The single apply operation (FR-033): load config, discover artifacts, plan,
 * then either preview (dry-run, FR-037) or execute. A zero-target selection is a
 * no-op (FR-054); an unknown target aborts before any write (FR-040); a
 * corrupt manifest aborts every deletion path (FR-050).
 */
export function apply(opts: RunOptions): ApplyReport {
  const fsGate = new GuardedFs(opts.projectRoot);
  const registry = opts.registry ?? builtinRegistry();

  const { effective: config } = resolveConfig(opts.projectRoot, opts.cli ?? {}, opts.globalDir);

  // Unknown-target guard: resolving the selection throws before any planning.
  registry.resolveSelection(config.targets);

  const base: ApplyReport = {
    dryRun: !!opts.dryRun,
    empty: false,
    zeroTargets: false,
    warnings: [],
    preview: [],
    changedFiles: 0,
    created: 0,
    overwritten: 0,
    unchanged: 0,
    removed: 0,
    backedUp: 0,
    plan: { writes: [], removals: [], warnings: [] },
  };

  if (selectsZeroTargets(config)) {
    return { ...base, zeroTargets: true, preview: ['0 targets selected; no-op run. 0 files written.'] };
  }

  const sourceRoot = path.resolve(opts.projectRoot, config.source);
  const discovery = discover(sourceRoot, opts.projectRoot);

  // loadOrEmpty throws on a corrupt (present-but-invalid) manifest (FR-050).
  const manifest = Manifest.loadOrEmpty(fsGate);
  manifest.setRegistryVersion(registry.version().version);

  const plan = planApply({
    fsGate,
    registry,
    priorManifest: manifest,
    artifacts: discovery.artifacts,
    config,
  });
  const warnings = [...discovery.warnings, ...plan.warnings];
  const changedFiles = changedFileCount(plan);

  if (opts.dryRun) {
    return {
      ...base,
      empty: discovery.report.empty,
      warnings,
      preview: previewPlan(plan, 'apply'),
      changedFiles,
      plan,
    };
  }

  const backups = new BackupManager(fsGate, config.backupRetention);
  const result = executeApply(plan, fsGate, manifest, backups);

  return {
    ...base,
    empty: discovery.report.empty,
    warnings,
    changedFiles,
    created: result.created,
    overwritten: result.overwritten,
    unchanged: result.unchanged,
    removed: result.removed,
    backedUp: result.backedUp,
    plan,
  };
}

/**
 * The single revert operation (FR-034): remove only manifest-recorded
 * tool-generated files. A missing or corrupt manifest aborts and deletes 0 files
 * (FR-050); reverting one target leaves a sibling target's files intact (FR-036).
 */
export function revert(opts: RunOptions): RevertReport {
  const fsGate = new GuardedFs(opts.projectRoot);
  const { effective: config } = resolveConfig(opts.projectRoot, opts.cli ?? {}, opts.globalDir);

  // Manifest.load throws ManifestError for absent/unreadable/corrupt (FR-050).
  const manifest = Manifest.load(fsGate);

  const plan = planRevert(manifest, config.targets);

  if (opts.dryRun) {
    return { dryRun: true, removed: 0, preview: previewPlan(plan, 'revert'), plan };
  }

  const removed = executeRevert(plan, fsGate, manifest);
  return { dryRun: false, removed, preview: [], plan };
}
