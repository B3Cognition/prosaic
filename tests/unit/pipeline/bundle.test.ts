import { Artifact } from '../../../src/domain/types';
import { runPipeline } from '../../../src/pipeline/runner';
import { makeDescriptor } from '../../helpers/descriptor-factory';

function skill(over: Partial<Artifact> = {}): Artifact {
  return {
    id: 'skills/greet/SKILL.md',
    type: 'skill',
    frontmatter: { name: 'greet', description: 'd' },
    body: 'See [ref](./ref.md)\n',
    sourcePath: 'skills/greet/SKILL.md',
    bundleRoot: 'skills/greet',
    resources: [{ relPath: 'ref.md', content: 'resource body' }],
    ...over,
  };
}

describe('bundle path rewrite (T-026, FR-012/FR-017/AC-012/AC-013)', () => {
  it('AC-012: relocated bundle keeps its internal reference resolvable', () => {
    const out = runPipeline(skill(), makeDescriptor({ id: 'claude', destinationDir: '.claude/skills' }));
    expect(out.content).toContain('](./ref.md)');
    // The resource travels with the bundle, relative to the primary output dir.
    expect(out.resources.some((r) => r.path.endsWith('/ref.md'))).toBe(true);
    expect(out.warnings.filter((w) => w.kind === 'unresolved-reference')).toHaveLength(0);
  });

  it('AC-013: an unresolved internal reference emits a warning naming it', () => {
    const out = runPipeline(
      skill({ body: 'See [missing](./gone.md)\n', resources: [] }),
      makeDescriptor({ id: 'claude' }),
    );
    const w = out.warnings.find((x) => x.kind === 'unresolved-reference');
    expect(w).toBeDefined();
    expect(w?.message).toContain('gone.md');
  });

  it('FR-017: skills get name + frontmatter + format transforms like commands', () => {
    const out = runPipeline(skill(), makeDescriptor({ id: 'claude', naming: { from: 'name', casing: 'kebab' } }));
    expect(out.path).toContain('greet');
    expect(out.content).toContain('name: greet');
  });
});
