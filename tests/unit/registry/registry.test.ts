import { validateDescriptor, runtimeCapabilityFor } from '../../../src/registry/descriptor';
import { Registry, StaticRegistrySource, UnknownTargetError } from '../../../src/registry/registry';
import { registerTarget } from '../../../src/registry/register';
import { isConformanceVerified, verifiedTargets } from '../../../src/registry/conformance-status';
import { REGISTRY_VERSION } from '../../../src/registry/version';
import { makeDescriptor } from '../../helpers/descriptor-factory';

describe('descriptor schema (T-014, FR-006/FR-044..FR-047)', () => {
  it('validates a complete descriptor', () => {
    expect(validateDescriptor(makeDescriptor()).ok).toBe(true);
  });
  it('a descriptor missing a required field is a hard error', () => {
    const bad = { ...makeDescriptor() } as any;
    delete bad.destinationDir;
    expect(validateDescriptor(bad).ok).toBe(false);
  });
});

describe('registry lookup + capability + version (T-015, FR-010/FR-007/NFR-011)', () => {
  const reg = new Registry(
    new StaticRegistrySource([
      makeDescriptor({ id: 'a', capabilities: { rule: true, skill: false, subagent: false, command: true } }),
      makeDescriptor({ id: 'b' }),
    ]),
  );

  it('AC-002: exposes native-support capability flags', () => {
    expect(reg.supports('a', 'rule')).toBe(true);
    expect(reg.supports('a', 'skill')).toBe(false);
  });
  it('AC-024: carries exactly one registry version identifier', () => {
    expect(reg.version().version).toBe(REGISTRY_VERSION.version);
  });
  it('FR-040: unknown target lookup throws', () => {
    expect(() => reg.get('missing')).toThrow(UnknownTargetError);
  });
  it('resolveSelection("all") returns every target sorted', () => {
    expect(reg.resolveSelection('all').map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('conformance gating (T-016, FR-009/FR-058)', () => {
  it('AC-025: verified only when >=1 test passes', () => {
    expect(isConformanceVerified(0)).toBe(false);
    expect(isConformanceVerified(1)).toBe(true);
  });
  it('verifiedTargets filters the zero-pass targets out', () => {
    const v = verifiedTargets(new Map([['a', 2], ['b', 0]]));
    expect([...v]).toEqual(['a']);
  });
});

describe('runtime capability declaration (FR-012, AC-010, AC-011)', () => {
  it('AC-010: reports exactly 4 acceptance flags for a target with a full declaration', () => {
    const desc = makeDescriptor({
      runtimeCapability: { model: 'accepts', reasoningEffort: 'accepts', tools: 'rejects', executionType: 'accepts' },
    });
    const cap = runtimeCapabilityFor(desc);
    expect(Object.keys(cap).sort()).toEqual(['executionType', 'model', 'reasoningEffort', 'tools'].sort());
    expect(cap).toEqual({ model: 'accepts', reasoningEffort: 'accepts', tools: 'rejects', executionType: 'accepts' });
  });

  it('AC-011: an entirely absent declaration reports unknown for all 4 fields, never accepts', () => {
    const desc = makeDescriptor();
    const cap = runtimeCapabilityFor(desc);
    expect(cap).toEqual({ model: 'unknown', reasoningEffort: 'unknown', tools: 'unknown', executionType: 'unknown' });
  });

  it('AC-011: a partially declared field falls back to unknown rather than assuming accepts', () => {
    const desc = makeDescriptor({ runtimeCapability: { model: 'accepts' } });
    const cap = runtimeCapabilityFor(desc);
    expect(cap.model).toBe('accepts');
    expect(cap.reasoningEffort).toBe('unknown');
    expect(cap.tools).toBe('unknown');
    expect(cap.executionType).toBe('unknown');
  });

  it('Registry.runtimeCapability queries a registered target by id', () => {
    const reg = new Registry(
      new StaticRegistrySource([makeDescriptor({ id: 'a', runtimeCapability: { model: 'rejects' } })]),
    );
    expect(reg.runtimeCapability('a')).toEqual({
      model: 'rejects',
      reasoningEffort: 'unknown',
      tools: 'unknown',
      executionType: 'unknown',
    });
  });

  it('Registry.runtimeCapability throws UnknownTargetError for an unregistered target', () => {
    const reg = new Registry(new StaticRegistrySource([makeDescriptor({ id: 'a' })]));
    expect(() => reg.runtimeCapability('missing')).toThrow(UnknownTargetError);
  });
});

describe('add-a-target (T-017, FR-008)', () => {
  it('AC-024: admits a new descriptor with no core changes', () => {
    const existing = [makeDescriptor({ id: 'a' })];
    const reg = registerTarget(existing, makeDescriptor({ id: 'new-one' }));
    expect(reg.has('new-one')).toBe(true);
    expect(reg.ids()).toEqual(['a', 'new-one']);
  });
  it('rejects a duplicate id', () => {
    expect(() => registerTarget([makeDescriptor({ id: 'a' })], makeDescriptor({ id: 'a' }))).toThrow();
  });
});
