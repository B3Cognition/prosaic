import { DeploymentType } from '../domain/types';
import { CliOverrides } from '../config/cli-override';
import { Registry } from '../registry/registry';

/** A per-field resolution result: whether the target could translate the field (FR-004). */
export interface ResolvedField<T> {
  status: 'resolved' | 'unresolved';
  value?: T;
}

/** The four-field result of resolving one artifact-target pair's execution settings (FR-002). */
export interface ResolvedExecutionData {
  artifactId: string;
  targetId: string;
  model: ResolvedField<unknown>;
  reasoningEffort: ResolvedField<unknown>;
  tools: ResolvedField<unknown>;
  executionType: ResolvedField<DeploymentType>;
}

/** The public API's return value: a success/failure discriminated union (ADR-003). */
export type ResolveExecutionResult =
  | { ok: true; data: ResolvedExecutionData }
  | { ok: false; errorKind: 'unregistered-target'; targetId: string; message: string }
  | { ok: false; errorKind: 'artifact-not-found'; artifactId: string; message: string }
  | { ok: false; errorKind: 'internal'; message: string };

/** Input to `resolveExecutionData()` (mirrors `apply()`/`revert()`'s `RunOptions` shape). */
export interface ResolveOptions {
  projectRoot: string;
  artifactId: string;
  targetId: string;
  cli?: CliOverrides;
  registry?: Registry;
}
