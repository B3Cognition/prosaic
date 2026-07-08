import { parseConfig } from '../../../src/config/schema';
import { applyCliOverrides, CliOverrideError } from '../../../src/config/cli-override';
import { mergeConfig, resolvePrecedence } from '../../../src/config/precedence';
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
