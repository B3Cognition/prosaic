import { loadCatalogOrFallback, CatalogRegistrySource } from '../../src/registry/catalog';
import { Registry } from '../../src/registry/registry';

describe('remote catalog fallback (T-040, FR-041/AC-028)', () => {
  it('AC-028: an unreachable catalog falls back to the built-in registry', () => {
    const result = loadCatalogOrFallback(() => {
      throw new Error('network down');
    });
    expect(result.usedFallback).toBe(true);
    expect(result.descriptors.length).toBeGreaterThanOrEqual(35);
  });

  it('AC-028: an invalid catalog falls back to the built-in registry', () => {
    const result = loadCatalogOrFallback(() => ({ descriptors: [{ bogus: true }] }));
    expect(result.usedFallback).toBe(true);
  });

  it('a valid catalog is used without fallback', () => {
    const valid = {
      version: '9.9.9',
      descriptors: [
        {
          id: 'from-catalog',
          destinationDir: '.cat/rules',
          format: 'markdown',
          extension: '.md',
          argumentToken: '$A',
          frontmatter: { strip: [], passthrough: '*', inject: {} },
          capabilities: { rule: true, skill: false, subagent: false, command: false },
        },
      ],
    };
    const source = new CatalogRegistrySource(() => valid);
    expect(source.usedFallback).toBe(false);
    const reg = new Registry(source);
    expect(reg.has('from-catalog')).toBe(true);
    expect(reg.version().version).toBe('9.9.9');
  });

  it('the run still completes over the fallback registry', () => {
    const reg = new Registry(new CatalogRegistrySource(() => {
      throw new Error('boom');
    }));
    expect(reg.all().length).toBeGreaterThanOrEqual(35);
  });
});
