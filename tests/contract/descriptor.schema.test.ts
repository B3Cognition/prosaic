import { validateDescriptor, supports, runtimeCapabilityFor } from '../../src/registry/descriptor';
import { builtinRegistry } from '../../src/registry/builtin';
import { ARTIFACT_TYPES } from '../../src/domain/types';
import { makeDescriptor } from '../helpers/descriptor-factory';

describe('every built-in descriptor validates (T-014, FR-044..FR-047)', () => {
  const registry = builtinRegistry();

  it('all descriptors pass the schema', () => {
    for (const desc of registry.all()) {
      expect(validateDescriptor(desc).ok).toBe(true);
    }
  });

  it('each descriptor declares one dir, one format, one argument token', () => {
    for (const desc of registry.all()) {
      expect(desc.destinationDir.length).toBeGreaterThan(0);
      expect(['markdown', 'toml', 'yaml']).toContain(desc.format);
      expect(desc.argumentToken.length).toBeGreaterThan(0);
    }
  });

  it('each descriptor declares strip/passthrough/inject + a capability flag per type', () => {
    for (const desc of registry.all()) {
      expect(desc.frontmatter).toHaveProperty('strip');
      expect(desc.frontmatter).toHaveProperty('passthrough');
      expect(desc.frontmatter).toHaveProperty('inject');
      for (const type of ARTIFACT_TYPES) {
        expect(typeof supports(desc, type)).toBe('boolean');
      }
    }
  });

  it('every target natively supports at least one artifact type', () => {
    for (const desc of registry.all()) {
      const supported = ARTIFACT_TYPES.some((t) => supports(desc, t));
      expect(supported).toBe(true);
    }
  });

  it('all target ids are unique', () => {
    const ids = registry.ids();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every built-in descriptor with no declared runtimeCapability queries as all-unknown (FR-012, AC-011)', () => {
    for (const desc of registry.all()) {
      if (desc.runtimeCapability) continue;
      expect(runtimeCapabilityFor(desc)).toEqual({
        model: 'unknown',
        reasoningEffort: 'unknown',
        tools: 'unknown',
        executionType: 'unknown',
      });
    }
  });
});

describe('runtimeCapability schema field (FR-012)', () => {
  it('rejects an invalid flag value', () => {
    const bad = { ...makeDescriptor(), runtimeCapability: { model: 'maybe' } } as unknown;
    expect(validateDescriptor(bad).ok).toBe(false);
  });

  it('accepts a fully declared runtimeCapability', () => {
    const desc = makeDescriptor({
      runtimeCapability: { model: 'accepts', reasoningEffort: 'rejects', tools: 'accepts', executionType: 'accepts' },
    });
    expect(validateDescriptor(desc).ok).toBe(true);
  });
});
