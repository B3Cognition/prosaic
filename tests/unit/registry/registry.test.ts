import { validateDescriptor } from '../../../src/registry/descriptor';
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
