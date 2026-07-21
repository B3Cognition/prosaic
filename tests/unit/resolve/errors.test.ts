import { ArtifactNotFoundError, UnknownTargetError } from '../../../src/resolve/errors';

describe('ArtifactNotFoundError', () => {
  it('is constructed with the rejected artifact id in its message', () => {
    const err = new ArtifactNotFoundError('rules/missing.md');
    expect(err.message).toContain('rules/missing.md');
    expect(err.artifactId).toBe('rules/missing.md');
  });

  it('is distinguishable from UnknownTargetError via instanceof and .name', () => {
    const err = new ArtifactNotFoundError('rules/missing.md');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ArtifactNotFoundError);
    expect(err.name).toBe('ArtifactNotFoundError');
    expect(err).not.toBeInstanceOf(UnknownTargetError);

    const unknownTarget = new UnknownTargetError('no-such-target');
    expect(unknownTarget).not.toBeInstanceOf(ArtifactNotFoundError);
    expect(unknownTarget.name).toBe('UnknownTargetError');
  });
});
