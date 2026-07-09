import { buildInverseMap, applyInverseMap, NonInjectiveValueMapError } from '../../../../src/import/neutralize/inverse-map';
import { parseDescriptor } from '../../../../src/registry/descriptor';
import { ALL_DESCRIPTORS } from '../../../../src/registry/adapters';
import { adapter } from '../../../../src/registry/adapters/build';

describe('buildInverseMap (T-006, FR-010, FR-054, FR-019, FR-081)', () => {
  it('maps concrete key back to exactly 1 neutral key (FR-010)', () => {
    const claudeCode = ALL_DESCRIPTORS.find((d) => d.id === 'claude-code')!;
    const inv = buildInverseMap(claudeCode);
    // claude-code has translations: tools → 'tools', color → 'color'
    expect(inv.has('tools')).toBe(true);
    expect(inv.get('tools')!.neutralKey).toBe('tools');
    expect(inv.has('color')).toBe(true);
    expect(inv.get('color')!.neutralKey).toBe('color');
  });

  it('maps 0 concrete-only keys to neutral behavior keys (FR-081)', () => {
    const claudeCode = ALL_DESCRIPTORS.find((d) => d.id === 'claude-code')!;
    const inv = buildInverseMap(claudeCode);
    // Only translated keys should appear in the map
    for (const [key] of inv) {
      expect(key).toMatch(/^(tools|color|capability|effort|invocation|visibility)$/);
    }
  });

  it('builds an empty inverse map for a descriptor with no translations', () => {
    const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;
    const inv = buildInverseMap(cline);
    expect(inv.size).toBe(0);
  });

  it('refuses a non-injective valueMap without inverse metadata (FR-019)', () => {
    const nonInjective = adapter({
      id: 'test-noninject',
      dir: '.test',
      translations: {
        capability: {
          toKey: 'level',
          valueMap: { 'basic': 'low', 'advanced': 'low' }, // two neutrals → same concrete
        },
      },
    });
    expect(() => buildInverseMap(nonInjective)).toThrow(NonInjectiveValueMapError);
  });

  it('builds real descriptors without throwing', () => {
    for (const desc of ALL_DESCRIPTORS) {
      expect(() => buildInverseMap(desc)).not.toThrow();
    }
  });
});

describe('applyInverseMap (T-006, FR-010, FR-054)', () => {
  it('recovers neutral values from concrete frontmatter', () => {
    const claudeCode = ALL_DESCRIPTORS.find((d) => d.id === 'claude-code')!;
    const inv = buildInverseMap(claudeCode);
    const { neutral, remaining } = applyInverseMap(
      { tools: ['bash', 'read'], color: 'blue', name: 'my-agent' },
      inv,
    );
    expect(neutral.tools).toEqual(['bash', 'read']);
    expect(neutral.color).toBe('blue');
    expect(remaining.name).toBe('my-agent');
    expect(remaining.tools).toBeUndefined();
  });

  it('places unknown keys in remaining (for overrides recovery)', () => {
    const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;
    const inv = buildInverseMap(cline);
    const { neutral, remaining } = applyInverseMap(
      { name: 'rule-name', customKey: 'customValue' },
      inv,
    );
    expect(Object.keys(neutral)).toHaveLength(0);
    expect(remaining.name).toBe('rule-name');
    expect(remaining.customKey).toBe('customValue');
  });
});
