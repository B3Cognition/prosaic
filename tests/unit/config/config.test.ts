import { parseConfig } from '../../../src/config/schema';
import { applyCliOverrides, CliOverrideError } from '../../../src/config/cli-override';
import { mergeConfig } from '../../../src/config/precedence';
import { toEffective, selectsZeroTargets, typeEnabled } from '../../../src/config/selection';
import { resolveConfig } from '../../../src/config/resolve';
import { ConfigError } from '../../../src/config/load';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('strict config (T-011, FR-029/FR-030)', () => {
  it('AC-023: rejects an unknown key and names it', () => {
    const r = parseConfig({ targets: ['a'], nope: 1 }, 'test');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unknownKeys).toContain('nope');
  });
  it('accepts a valid config', () => {
    const r = parseConfig({ targets: 'all', artifactTypes: ['rule'] }, 'test');
    expect(r.ok).toBe(true);
  });
});

describe('package declaration schema (T-001, FR-001/FR-002/FR-003/FR-004/FR-036)', () => {
  it('AC-029/AC-030: 0/1/2+ valid package declarations parse', () => {
    expect(parseConfig({}, 'test').ok).toBe(true);
    expect(
      parseConfig({ packages: [{ id: 'a', sourceRoot: 'pkg-a', destinationRoot: 'dest-a' }] }, 'test')
        .ok,
    ).toBe(true);
    expect(
      parseConfig(
        {
          packages: [
            { id: 'a', sourceRoot: 'pkg-a', destinationRoot: 'dest-a' },
            { id: 'b', sourceRoot: 'pkg-b', destinationRoot: 'dest-b' },
          ],
        },
        'test',
      ).ok,
    ).toBe(true);
  });

  it('AC-053: an unrecognized key inside a package entry is rejected, naming it', () => {
    const r = parseConfig(
      { packages: [{ id: 'a', sourceRoot: 's', destinationRoot: 'd', extra: 1 }] },
      'test',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('extra');
  });

  it('AC-031: a duplicate id within packages[] is rejected', () => {
    const r = parseConfig(
      {
        packages: [
          { id: 'dup', sourceRoot: 's1', destinationRoot: 'd1' },
          { id: 'dup', sourceRoot: 's2', destinationRoot: 'd2' },
        ],
      },
      'test',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('dup');
  });

  it('AC-032: packages omitted parses byte-identically to the pre-feature schema', () => {
    const withoutPackages = parseConfig({ targets: 'all', source: 'x' }, 'test');
    expect(withoutPackages.ok).toBe(true);
    if (withoutPackages.ok) {
      expect(withoutPackages.config).toEqual({ targets: 'all', source: 'x' });
      expect('packages' in withoutPackages.config).toBe(false);
    }
  });

  it('AC-021: every other config section validates identically with a package declared', () => {
    const before = parseConfig({ targets: 'all', nope: 1 }, 'test');
    const after = parseConfig({ targets: 'all', nope: 1, packages: [] }, 'test');
    expect(before.ok).toBe(false);
    expect(after.ok).toBe(false);
    if (!before.ok && !after.ok) {
      expect(after.unknownKeys).toEqual(before.unknownKeys);
    }
  });
});

describe('package-declaration strictness parity (NFR-006)', () => {
  it('an unrecognized key inside a package entry is rejected the same way as an unrecognized top-level key', () => {
    const topLevel = parseConfig({ bogus: 1 }, 'test');
    const insidePackage = parseConfig(
      { packages: [{ id: 'a', sourceRoot: 's', destinationRoot: 'd', bogus: 1 }] },
      'test',
    );
    expect(topLevel.ok).toBe(false);
    expect(insidePackage.ok).toBe(false);
    if (!topLevel.ok && !insidePackage.ok) {
      expect(topLevel.message).toMatch(/unknown key\(s\)/);
      expect(insidePackage.message).toMatch(/unknown key\(s\)/);
    }
  });
});

describe('precedence (T-012, FR-031)', () => {
  it('project overrides ancestor overrides global (key-wise)', () => {
    const merged = mergeConfig(
      mergeConfig({ source: 'g', lossyPolicy: 'warn' }, { source: 'a' }),
      { source: 'p' },
    );
    expect(merged.source).toBe('p');
    expect(merged.lossyPolicy).toBe('warn');
  });
});

describe('cli overrides + selection (T-013, FR-032/FR-054/FR-060)', () => {
  it('AC-022: a CLI target flag replaces exactly one file value', () => {
    const out = applyCliOverrides({ targets: ['x'], source: 's' }, { targets: ['y'] });
    expect(out.targets).toEqual(['y']);
    expect(out.source).toBe('s');
  });
  it('rejects an unknown artifact type override', () => {
    expect(() => applyCliOverrides({}, { artifactTypes: ['bogus'] })).toThrow(CliOverrideError);
  });
  it('AC-035: zero-target selection is detected as no-op', () => {
    expect(selectsZeroTargets(toEffective({ targets: [] }))).toBe(true);
    expect(selectsZeroTargets(toEffective({ targets: 'all' }))).toBe(false);
  });
  it('AC-022: disabled artifact type is not enabled', () => {
    const cfg = toEffective({ artifactTypes: ['rule'] });
    expect(typeEnabled(cfg, 'rule')).toBe(true);
    expect(typeEnabled(cfg, 'command')).toBe(false);
  });
});

describe('resolveConfig end-to-end precedence (FR-031)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('reads a project config file and applies CLI override on top', () => {
    t.write('prosaic.config.yaml', 'source: srcdir\ntargets:\n  - a\n');
    const { effective } = resolveConfig(t.root, { targets: ['b'] });
    expect(effective.source).toBe('srcdir');
    expect(effective.targets).toEqual(['b']);
  });

  it('AC-023: a bad project config throws ConfigError', () => {
    t.write('prosaic.config.yaml', 'bogusKey: 1\n');
    expect(() => resolveConfig(t.root, {})).toThrow(ConfigError);
  });
});
