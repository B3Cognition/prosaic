/**
 * Prosaic — MD-Prose Distribution Engine. Public library surface: the apply and
 * revert operations, the registry, and the transformation pipeline.
 */
export { apply, revert } from './lifecycle/run';
export type { ApplyReport, RevertReport, RunOptions } from './lifecycle/run';
export { builtinRegistry, BuiltinRegistrySource } from './registry/builtin';
export { Registry, StaticRegistrySource, UnknownTargetError } from './registry/registry';
export { registerTarget } from './registry/register';
export { REGISTRY_VERSION } from './registry/version';
export { runPipeline, PIPELINE_STAGES } from './pipeline/runner';
export { discover } from './discovery/discover';
export type { TargetDescriptor } from './registry/descriptor';
export { descriptorSchema, validateDescriptor, parseDescriptor } from './registry/descriptor';
export type { Artifact, ArtifactType, DeploymentType } from './domain/types';
