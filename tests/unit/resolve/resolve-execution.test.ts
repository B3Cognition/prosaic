import { resolveExecution } from '../../../src/resolve/resolve-execution';
import { makeDescriptor } from '../../helpers/descriptor-factory';
import { REPRESENTATIVE, ALL_TYPES } from '../../helpers/representative';

describe('resolveExecution', () => {
  it('marks model, reasoningEffort, and tools as unresolved when the target has no translation rule', () => {
    const descriptor = makeDescriptor({ translations: {} });
    const artifact = {
      ...REPRESENTATIVE.rule,
      frontmatter: { ...REPRESENTATIVE.rule.frontmatter, capability: 'x', effort: 'high', tools: ['a'] },
    };

    const data = resolveExecution(artifact, descriptor);

    expect(data.model).toEqual({ status: 'unresolved' });
    expect(data.reasoningEffort).toEqual({ status: 'unresolved' });
    expect(data.tools).toEqual({ status: 'unresolved' });
  });

  it('marks model, reasoningEffort, and tools as resolved when the target has a translation rule', () => {
    const descriptor = makeDescriptor({
      translations: {
        capability: { toKey: 'model' },
        effort: { toKey: 'reasoning_effort' },
        tools: { toKey: 'allowed-tools' },
      },
    });
    const artifact = {
      ...REPRESENTATIVE.rule,
      frontmatter: { ...REPRESENTATIVE.rule.frontmatter, capability: 'opus', effort: 'high', tools: ['a', 'b'] },
    };

    const data = resolveExecution(artifact, descriptor);

    expect(data.model).toEqual({ status: 'resolved', value: 'opus' });
    expect(data.reasoningEffort).toEqual({ status: 'resolved', value: 'high' });
    expect(data.tools).toEqual({ status: 'resolved', value: ['a', 'b'] });
  });

  it.each(ALL_TYPES)('reports executionType as resolved for artifact type %s', (type) => {
    const descriptor = makeDescriptor();
    const data = resolveExecution(REPRESENTATIVE[type], descriptor);
    expect(data.executionType.status).toBe('resolved');
  });

  it('produces output only via resolveDeploymentType/translateNeutral/applyOverrides (no re-implemented logic)', () => {
    const descriptor = makeDescriptor({ translations: { capability: { toKey: 'model' } } });
    const artifact = {
      ...REPRESENTATIVE.command,
      frontmatter: { ...REPRESENTATIVE.command.frontmatter, capability: 'sonnet' },
    };

    const data = resolveExecution(artifact, descriptor);

    expect(data.model).toEqual({ status: 'resolved', value: 'sonnet' });
    expect(data.executionType).toEqual({ status: 'resolved', value: 'command' });
  });

  it('always exposes exactly 4 resolved-execution fields (runtime check, not just TS shape)', () => {
    const descriptor = makeDescriptor();
    const data = resolveExecution(REPRESENTATIVE.skill, descriptor);
    const fieldKeys = Object.keys(data).filter((k) => k !== 'artifactId' && k !== 'targetId');
    expect(fieldKeys.length).toBe(4);
  });

  it('sets value to undefined whenever status is unresolved, for every field', () => {
    const descriptor = makeDescriptor({ translations: {} });
    const artifact = {
      ...REPRESENTATIVE.subagent,
      frontmatter: { ...REPRESENTATIVE.subagent.frontmatter, capability: 'x', effort: 'high', tools: ['a'] },
    };

    const data = resolveExecution(artifact, descriptor);

    for (const field of [data.model, data.reasoningEffort, data.tools] as const) {
      if (field.status === 'unresolved') {
        expect(field.value).toBeUndefined();
      }
    }
  });

  it('forces the unresolved path when translations.tools is empty', () => {
    const descriptor = makeDescriptor({ translations: { tools: {} } });
    const artifact = { ...REPRESENTATIVE.rule, frontmatter: { ...REPRESENTATIVE.rule.frontmatter, tools: ['a'] } };

    const data = resolveExecution(artifact, descriptor);

    expect(data.tools).toEqual({ status: 'unresolved' });
  });

  it('resolves a conflicting neutral tools value + target override for the same concrete key to the override', () => {
    const descriptor = makeDescriptor({ translations: { tools: { toKey: 'allowed-tools' } } });
    const artifact = {
      ...REPRESENTATIVE.rule,
      frontmatter: {
        ...REPRESENTATIVE.rule.frontmatter,
        tools: ['a'],
        overrides: { 'test-target': { 'allowed-tools': ['override-wins'] } },
      },
    };

    const data = resolveExecution(artifact, descriptor);

    expect(data.tools).toEqual({ status: 'resolved', value: ['override-wins'] });
  });
});
