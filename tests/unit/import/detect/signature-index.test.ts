import { SignatureIndex } from '../../../../src/import/detect/signature-index';
import { ALL_DESCRIPTORS } from '../../../../src/registry/adapters';
import { StaticRegistrySource } from '../../../../src/registry/registry';
import { Registry } from '../../../../src/registry/registry';

const registry = new Registry(new StaticRegistrySource(ALL_DESCRIPTORS));

describe('SignatureIndex (T-002, FR-008)', () => {
  const index = SignatureIndex.build(ALL_DESCRIPTORS);

  it('is built from the descriptor registry without modifying the registry', () => {
    const before = registry.all().length;
    SignatureIndex.build(ALL_DESCRIPTORS);
    expect(registry.all().length).toBe(before);
  });

  it('maps an unambiguous layout to exactly 1 descriptor (FR-008)', () => {
    // claude-code command slot: .claude/commands/foo.md
    const matches = index.matchFile('.claude/commands/foo.md');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe('claude-code');
  });

  it('maps an unambiguous longtail directory to exactly 1 descriptor', () => {
    // cline: .clinerules/bar.md
    const matches = index.matchFile('.clinerules/bar.md');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe('cline');
  });

  it('maps a codex-cli toml file to exactly 1 descriptor', () => {
    const matches = index.matchFile('.codex/prompts/cmd.toml');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe('codex-cli');
  });

  it('maps goose yaml to exactly 1 descriptor', () => {
    const matches = index.matchFile('.goose/recipes/recipe.yaml');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe('goose');
  });

  it('returns empty for a file in an unrecognized directory', () => {
    const matches = index.matchFile('.unknown-tool/file.md');
    expect(matches).toHaveLength(0);
  });

  it('maps claude-code agent slot to claude-code', () => {
    const matches = index.matchFile('.claude/agents/my-agent.md');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe('claude-code');
  });

  it('maps cursor mdc file to cursor', () => {
    const matches = index.matchFile('.cursor/rules/my-rule.mdc');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toBe('cursor');
  });

  it('maps github-copilot instructions file', () => {
    const matches = index.matchFile('.github/instructions/my-rule.instructions.md');
    expect(matches.length).toBeGreaterThan(0);
    if (matches.length === 1) {
      expect(matches[0]).toBe('github-copilot');
    }
  });

  it('all() returns entries for all descriptors', () => {
    const entries = index.all();
    const descriptorIds = new Set(entries.map((e) => e.descriptorId));
    for (const d of ALL_DESCRIPTORS) {
      expect(descriptorIds.has(d.id)).toBe(true);
    }
  });
});
