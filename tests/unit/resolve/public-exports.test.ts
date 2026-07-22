import {
  resolveExecutionData,
  resolveExecution,
  ArtifactNotFoundError,
  runtimeCapabilityFor,
} from '../../../src/index';
import type {
  ResolvedExecutionData,
  ResolveExecutionResult,
  ResolveOptions,
  RuntimeCapabilityDeclaration,
} from '../../../src/index';

// T-007: compile-time proof that the resolution API is importable from the
// package's public entry point (`src/index.ts`), matching `contracts/library-api.md`.
describe('T-007: public library surface exports the resolution API', () => {
  it('exposes resolveExecutionData and resolveExecution as functions', () => {
    expect(typeof resolveExecutionData).toBe('function');
    expect(typeof resolveExecution).toBe('function');
  });

  it('exposes ArtifactNotFoundError as a constructable, identifiable error class', () => {
    const err = new ArtifactNotFoundError('rules/missing.md');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ArtifactNotFoundError);
    expect(err.name).toBe('ArtifactNotFoundError');
  });

  it('types compile: ResolvedExecutionData, ResolveExecutionResult, ResolveOptions are usable from the package root', () => {
    const options: ResolveOptions = {
      projectRoot: '.',
      artifactId: 'rules/style.md',
      targetId: 'claude-code',
    };
    const failure: ResolveExecutionResult = {
      ok: false,
      errorKind: 'internal',
      message: 'unused',
    };
    const data: ResolvedExecutionData = {
      artifactId: 'rules/style.md',
      targetId: 'claude-code',
      model: { status: 'unresolved' },
      reasoningEffort: { status: 'unresolved' },
      tools: { status: 'unresolved' },
      executionType: { status: 'resolved', value: 'agent' },
    };

    expect(options.artifactId).toBe('rules/style.md');
    expect(failure.ok).toBe(false);
    expect(data.targetId).toBe('claude-code');
  });

  it('exposes runtimeCapabilityFor (FR-012) and the RuntimeCapabilityDeclaration type', () => {
    expect(typeof runtimeCapabilityFor).toBe('function');
    const cap: RuntimeCapabilityDeclaration = {
      model: 'unknown',
      reasoningEffort: 'unknown',
      tools: 'unknown',
      executionType: 'unknown',
    };
    expect(cap.model).toBe('unknown');
  });
});
