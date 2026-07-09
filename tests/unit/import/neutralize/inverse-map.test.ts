import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildInverseMap, applyInverseMap, NonInjectiveValueMapError } from '../../../../src/import/neutralize/inverse-map';
import { neutralize } from '../../../../src/import/neutralize/neutralize';
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

describe('neutralize() with non-injective valueMap (FR-019 integration)', () => {
  it('returns ok:false when descriptor has non-injective valueMap (FR-019)', () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fr019-')));
    try {
      const fileAbs = path.join(tmp, 'rule.md');
      fs.writeFileSync(fileAbs, '---\nname: my-rule\nlevel: low\n---\n\nBody\n');

      const nonInjective = adapter({
        id: 'test-noninject-e2e',
        dir: '.test/rules',
        translations: {
          capability: {
            toKey: 'level',
            valueMap: { basic: 'low', advanced: 'low' },
          },
        },
      });

      const result = neutralize(fileAbs, 'rule.md', nonInjective, tmp);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.dropped.reason).toContain('test-noninject-e2e');
        expect(result.dropped.warnings[0].kind).toBe('unrecognized-format');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
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
