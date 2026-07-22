export { UnknownTargetError } from '../registry/registry';

/** Raised when a requested artifact id is absent from discovery (FR-008). */
export class ArtifactNotFoundError extends Error {
  constructor(public readonly artifactId: string) {
    super(`Unknown artifact: "${artifactId}" was not found by discovery`);
    this.name = 'ArtifactNotFoundError';
  }
}
