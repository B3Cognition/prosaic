import { renderMarkdown } from '../../../src/render/markdown';
import { renderTomlFile } from '../../../src/render/toml';
import { renderYamlFile } from '../../../src/render/yaml';
import { Artifact } from '../../../src/domain/types';
import { runPipeline } from '../../../src/pipeline/runner';
import { makeDescriptor } from '../../helpers/descriptor-factory';

describe('canonical serializers (T-027, FR-020/FR-021/NFR-009)', () => {
  it('markdown is byte-identical across repeated renders', () => {
    const a = renderMarkdown({ b: 2, a: 1 }, 'Body');
    const b = renderMarkdown({ a: 1, b: 2 }, 'Body');
    expect(a).toBe(b); // deterministic key order regardless of insertion order
  });

  it('TOML canonical key order is deterministic', () => {
    const a = renderTomlFile({ z: 'z', a: 'a' }, 'Body', 'prompt');
    const b = renderTomlFile({ a: 'a', z: 'z' }, 'Body', 'prompt');
    expect(a).toBe(b);
    expect(a).toContain('prompt = ');
  });

  it('YAML canonical output is deterministic and quotes stably', () => {
    const a = renderYamlFile({ title: 'T', extra: 'e' }, 'Body', 'instructions');
    const b = renderYamlFile({ extra: 'e', title: 'T' }, 'Body', 'instructions');
    expect(a).toBe(b);
    expect(a).toContain('instructions:');
  });
});

describe('companions (T-028, FR-022)', () => {
  it('emits primary + companion in one pass', () => {
    const a: Artifact = {
      id: 'commands/foo.md',
      type: 'command',
      frontmatter: { description: 'd' },
      body: 'Body',
      sourcePath: 'commands/foo.md',
    };
    const desc = makeDescriptor({
      id: 'copilot',
      destinationDir: '.github/prompts',
      companions: [{ nameTemplate: '{name}.meta.json', content: '{"name":"{name}"}' }],
    });
    const out = runPipeline(a, desc);
    expect(out.companions).toHaveLength(1);
    expect(out.companions[0].path).toContain('.meta.json');
    expect(out.companions[0].content).toContain('foo');
  });
});
