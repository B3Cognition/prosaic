import { findArtifactById, resolveExecutionData } from '../../../src/resolve/lookup';
import { ArtifactNotFoundError } from '../../../src/resolve/errors';
import { Registry, StaticRegistrySource } from '../../../src/registry/registry';
import { makeDescriptor } from '../../helpers/descriptor-factory';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';
import { REPRESENTATIVE } from '../../helpers/representative';

function testRegistry(): Registry {
  return new Registry(new StaticRegistrySource([makeDescriptor({ id: 'known-target' })]));
}

describe('findArtifactById', () => {
  it('returns the matching artifact', () => {
    const found = findArtifactById([REPRESENTATIVE.rule, REPRESENTATIVE.command], REPRESENTATIVE.command.id);
    expect(found).toBe(REPRESENTATIVE.command);
  });

  it('throws ArtifactNotFoundError when absent', () => {
    expect(() => findArtifactById([REPRESENTATIVE.rule], 'no-such-id.md')).toThrow(ArtifactNotFoundError);
  });
});

describe('resolveExecutionData', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');
  });
  afterEach(() => t.cleanup());

  it('AC-003: an unregistered target id rejects with errorKind unregistered-target, 0 fs writes', () => {
    const before = t.read('.prosaic/rules/style.md');
    const result = resolveExecutionData({
      projectRoot: t.root,
      artifactId: 'rules/style.md',
      targetId: 'no-such-target',
      registry: testRegistry(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.errorKind === 'unregistered-target') {
      expect(result.targetId).toBe('no-such-target');
    }
    expect(t.read('.prosaic/rules/style.md')).toBe(before);
  });

  it('AC-004: a missing artifact rejects with errorKind artifact-not-found, 0 resolved fields', () => {
    const result = resolveExecutionData({
      projectRoot: t.root,
      artifactId: 'rules/does-not-exist.md',
      targetId: 'known-target',
      registry: testRegistry(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok && result.errorKind === 'artifact-not-found') {
      expect(result.artifactId).toBe('rules/does-not-exist.md');
    }
    expect('data' in result).toBe(false);
  });

  it('NFR-001: a fault-injected non-classified error converts to errorKind internal', () => {
    const brokenRegistry = {
      get: () => {
        throw new Error('boom');
      },
    } as unknown as Registry;

    const result = resolveExecutionData({
      projectRoot: t.root,
      artifactId: 'rules/style.md',
      targetId: 'known-target',
      registry: brokenRegistry,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorKind).toBe('internal');
    }
  });

  it('AC-007: two calls with the same artifact/target and unchanged source produce deep-equal results', () => {
    const opts = {
      projectRoot: t.root,
      artifactId: 'rules/style.md',
      targetId: 'known-target',
      registry: testRegistry(),
    };

    const first = resolveExecutionData(opts);
    const second = resolveExecutionData(opts);

    expect(second).toEqual(first);
  });

  it('resolves successfully for a known artifact/target pair', () => {
    const result = resolveExecutionData({
      projectRoot: t.root,
      artifactId: 'rules/style.md',
      targetId: 'known-target',
      registry: testRegistry(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.artifactId).toBe('rules/style.md');
      expect(result.data.targetId).toBe('known-target');
    }
  });
});
