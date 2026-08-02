import { Artifact } from '../../../src/domain/types';
import { resolveDeploymentType } from '../../../src/pipeline/stages/stage0-resolve';
import { runPipeline, PIPELINE_STAGES } from '../../../src/pipeline/runner';
import { makeDescriptor } from '../../helpers/descriptor-factory';
import { NEUTRAL_KEYS, NeutralKey } from '../../../src/registry/descriptor';

function artifact(over: Partial<Artifact> = {}): Artifact {
  return {
    id: 'commands/foo.md',
    type: 'command',
    frontmatter: {},
    body: 'Body',
    sourcePath: 'commands/foo.md',
    ...over,
  };
}

describe('stage 0 deployment resolution (T-018, FR-048/AC-034)', () => {
  it('declared execution intent maps to its deployment type', () => {
    expect(resolveDeploymentType(artifact({ frontmatter: { execution: 'skill' } }))).toBe('skill');
  });
  it('absent execution intent resolves from artifact type', () => {
    expect(resolveDeploymentType(artifact({ type: 'command' }))).toBe('command');
    expect(resolveDeploymentType(artifact({ type: 'subagent' }))).toBe('agent');
  });
});

describe('pipeline runner order-and-once (T-019, FR-011/FR-059)', () => {
  it('runs the 8 stages in fixed order, each exactly once', () => {
    const trace: string[] = [];
    runPipeline(artifact(), makeDescriptor(), { trace });
    expect(trace).toEqual([
      'path-rewrite',
      'name-rewrite',
      'argument-rewrite',
      'neutral-translate',
      'neutral-strip',
      'frontmatter-rewrite',
      'format-conversion',
      'deployment-route',
    ]);
    expect(PIPELINE_STAGES.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('stage 2 name rewrite (T-020, FR-013)', () => {
  it('computes distinct names per target naming rule', () => {
    const a = artifact({ frontmatter: { name: 'My Command' } });
    const kebab = runPipeline(a, makeDescriptor({ id: 'k', naming: { from: 'name', casing: 'kebab' } }));
    expect(kebab.path.endsWith('My-Command.md') || kebab.path.endsWith('my-command.md')).toBe(true);
  });
});

describe('stage 3 argument rewrite (T-021, FR-014)', () => {
  it('rewrites placeholders to the target argument token', () => {
    const a = artifact({ body: 'Run with {{args}} now' });
    const out = runPipeline(a, makeDescriptor({ argumentToken: '$INPUT' }));
    expect(out.content).toContain('$INPUT');
    expect(out.content).not.toContain('{{args}}');
  });
});

describe('stages 4/5 translate + strip (T-022, FR-015/FR-042)', () => {
  it('translates neutral keys to concrete frontmatter and strips neutral names', () => {
    const a = artifact({
      type: 'subagent',
      sourcePath: 'subagents/foo.md',
      id: 'subagents/foo.md',
      frontmatter: { name: 'foo', description: 'd', visibility: 'hidden' },
    });
    const desc = makeDescriptor({
      id: 'claude',
      translations: { visibility: { toKey: 'hidden', valueMap: { hidden: true, user: false } } },
    });
    const out = runPipeline(a, desc);
    expect(out.content).toContain('hidden: true');
    expect(out.content).not.toContain('visibility:');
  });

  it('AC-009 cross-cut: zero neutral vocab keys remain when translations rename them', () => {
    const a = artifact({ frontmatter: { color: 'red', effort: 'high' } });
    const desc = makeDescriptor({ id: 't', translations: { color: { toKey: 'theme' } } });
    const out = runPipeline(a, desc, { lossyPolicy: 'warn' });
    expect(out.content).not.toMatch(/\ncolor:/);
    expect(out.content).not.toMatch(/\neffort:/);
    expect(out.content).toContain('theme: red');
  });
});

describe('stage 4 override + lossy (T-023, FR-016/FR-018)', () => {
  it('AC-010: emits a target-specific override value', () => {
    const a = artifact({ frontmatter: { overrides: { claude: { special: 'yes' } } } });
    const out = runPipeline(a, makeDescriptor({ id: 'claude' }));
    expect(out.content).toContain('special: yes');
  });
  it('AC-011: warns on non-representable intent naming artifact + target + intent', () => {
    const a = artifact({ frontmatter: { effort: 'high' } });
    const out = runPipeline(a, makeDescriptor({ id: 'nocaps', translations: {} }));
    const w = out.warnings.find((x) => x.kind === 'lossy-intent');
    expect(w).toBeDefined();
    expect(w?.target).toBe('nocaps');
    expect(w?.message).toContain('effort');
  });
});

describe('stage 6 frontmatter rewrite (T-024, FR-043)', () => {
  it('applies strip, passthrough, inject', () => {
    const a = artifact({ frontmatter: { keepme: 1, dropme: 2 } });
    const desc = makeDescriptor({
      frontmatter: { strip: ['dropme'], passthrough: '*', inject: { injected: 'x' } },
    });
    const out = runPipeline(a, desc);
    expect(out.content).toContain('keepme: 1');
    expect(out.content).not.toContain('dropme');
    expect(out.content).toContain('injected: x');
  });
});

describe('model_tier render pipeline non-interaction (T-005, FR-009/FR-010/FR-011/FR-017, NFR-004)', () => {
  it('AC-011: model_tier appears unchanged in rendered output', () => {
    const a = artifact({ frontmatter: { model_tier: 'ultra' } });
    const out = runPipeline(a, makeDescriptor());
    expect(out.content).toContain('model_tier: ultra');
  });

  it('AC-012/AC-014: 0 fields are derived from model_tier and 0 lossy-intent findings are recorded for it', () => {
    const a = artifact({ frontmatter: { model_tier: 'ultra' } });
    const desc = makeDescriptor({ id: 'nocaps', translations: {} });
    const out = runPipeline(a, desc, { lossyPolicy: 'warn' });
    const occurrences = out.content.split('model_tier').length - 1;
    expect(occurrences).toBe(1);
    expect(out.warnings.some((w) => w.message.includes('model_tier'))).toBe(false);
    expect(out.warnings.some((w) => w.kind === 'lossy-intent' && w.message.includes('model_tier'))).toBe(false);
  });

  it('an artifact omitting model_tier renders unaffected by this feature (NFR-004)', () => {
    const a = artifact({ frontmatter: { color: 'red' } });
    const desc = makeDescriptor({ id: 't', translations: { color: { toKey: 'theme' } } });
    const out = runPipeline(a, desc, { lossyPolicy: 'warn' });
    expect(out.content).not.toMatch(/model_tier/);
    expect(out.content).toContain('theme: red');
  });
});

describe('model_tier co-presence with the 7 existing neutral keys (T-009, FR-012, AC-013)', () => {
  const KEY_FIXTURES: Record<NeutralKey, { frontmatter: Record<string, unknown>; translations?: Record<string, unknown> }> = {
    execution: { frontmatter: { execution: 'skill' } },
    capability: { frontmatter: { capability: 'opus' }, translations: { capability: { toKey: 'model' } } },
    effort: { frontmatter: { effort: 'high' }, translations: { effort: { toKey: 'reasoning_effort' } } },
    tools: { frontmatter: { tools: ['bash', 'read'] }, translations: { tools: { toKey: 'tools' } } },
    invocation: { frontmatter: { invocation: 'manual' }, translations: { invocation: { toKey: 'invocation' } } },
    visibility: {
      frontmatter: { visibility: 'hidden' },
      translations: { visibility: { toKey: 'hidden', valueMap: { hidden: true, user: false } } },
    },
    color: { frontmatter: { color: 'red' }, translations: { color: { toKey: 'theme' } } },
  };

  describe.each(NEUTRAL_KEYS)('%s', (key) => {
    it("the key's translate/strip output is byte-identical with and without model_tier present", () => {
      const fixture = KEY_FIXTURES[key];
      const desc = makeDescriptor({ id: 'co-presence-target', translations: fixture.translations ?? {} });
      const withoutTier = artifact({ frontmatter: { ...fixture.frontmatter } });
      const withTier = artifact({ frontmatter: { ...fixture.frontmatter, model_tier: 'strong' } });

      const outWithout = runPipeline(withoutTier, desc, { lossyPolicy: 'warn' });
      const outWith = runPipeline(withTier, desc, { lossyPolicy: 'warn' });

      if (key === 'execution') {
        expect(outWith.path).toBe(outWithout.path);
        return;
      }
      const strippedWith = outWith.content.replace(/\nmodel_tier: strong/, '');
      expect(strippedWith).toBe(outWithout.content);
    });
  });
});

describe('stage 8 routing (T-025, FR-023/FR-062)', () => {
  it('AC-016: routes one artifact to command/skill/agent slots across targets', () => {
    const desc = makeDescriptor({
      id: 'multi',
      slots: {
        command: { dir: '.x/commands', extension: '.md' },
        skill: { dir: '.x/skills', extension: '.md' },
        agent: { dir: '.x/agents', extension: '.md' },
      },
    });
    const cmd = runPipeline(artifact({ frontmatter: { execution: 'command' } }), desc);
    const skill = runPipeline(artifact({ frontmatter: { execution: 'skill' } }), desc);
    const agent = runPipeline(artifact({ frontmatter: { execution: 'agent' } }), desc);
    expect(cmd.path.startsWith('.x/commands/')).toBe(true);
    expect(skill.path.startsWith('.x/skills/')).toBe(true);
    expect(agent.path.startsWith('.x/agents/')).toBe(true);
  });
});
