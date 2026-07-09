import { recoverOverrides } from '../../../../src/import/neutralize/recover-overrides';

describe('recoverOverrides (T-008, FR-013, FR-055, FR-056, FR-065, FR-028)', () => {
  it('recovers unknown keys into 1 per-target overrides section keyed by target id (FR-013, FR-055)', () => {
    const { overrides } = recoverOverrides(
      { customKey: 'customValue', anotherKey: 42 },
      'my-target',
      'test.md',
    );
    expect(overrides.customKey).toBe('customValue');
    expect(overrides.anotherKey).toBe(42);
  });

  it('preserves key name and value with 0 alterations (FR-056)', () => {
    const original = { myKey: { nested: [1, 2, 3] } };
    const { overrides } = recoverOverrides(original, 'my-target', 'test.md');
    expect(JSON.stringify(overrides.myKey)).toBe(JSON.stringify(original.myKey));
  });

  it('drops 0 unknown keys (FR-065)', () => {
    const fm = { a: 1, b: 2, c: 3 };
    const { overrides } = recoverOverrides(fm, 'my-target', 'test.md');
    expect(Object.keys(overrides)).toHaveLength(3);
  });

  it('emits 1 warning per unknown key naming the key (FR-028)', () => {
    const { warnings } = recoverOverrides(
      { alpha: 'x', beta: 'y' },
      'my-target',
      'test.md',
    );
    expect(warnings).toHaveLength(2);
    expect(warnings[0].kind).toBe('override-recovered');
    expect(warnings[0].message).toContain('alpha');
    expect(warnings[1].message).toContain('beta');
  });

  it('returns empty overrides and 0 warnings for empty remaining map', () => {
    const { overrides, warnings } = recoverOverrides({}, 'my-target', 'test.md');
    expect(overrides).toEqual({});
    expect(warnings).toHaveLength(0);
  });

  it('warning target field is set to the target id', () => {
    const { warnings } = recoverOverrides({ key: 'val' }, 'my-target', 'test.md');
    expect(warnings[0].target).toBe('my-target');
  });
});
