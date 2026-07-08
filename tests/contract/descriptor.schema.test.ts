import { validateDescriptor, supports } from '../../src/registry/descriptor';
import { builtinRegistry } from '../../src/registry/builtin';
import { ARTIFACT_TYPES } from '../../src/domain/types';

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
});
