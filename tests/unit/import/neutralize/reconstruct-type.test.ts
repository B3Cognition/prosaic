import { reconstructType } from '../../../../src/import/neutralize/reconstruct-type';
import { ALL_DESCRIPTORS } from '../../../../src/registry/adapters';

const claudeCode = ALL_DESCRIPTORS.find((d) => d.id === 'claude-code')!;
const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;
const cursor = ALL_DESCRIPTORS.find((d) => d.id === 'cursor')!;

describe('reconstructType (T-009, FR-014, FR-057, FR-015, FR-058)', () => {
  it('reconstructs command from command slot directory (FR-014, FR-057)', () => {
    const result = reconstructType('.claude/commands/foo.md', claudeCode, 'foo.md');
    expect(result.type).toBe('command');
    expect(result.warnings).toHaveLength(0);
  });

  it('reconstructs skill from skill slot directory', () => {
    const result = reconstructType('.claude/skills/my-skill.md', claudeCode, 'my-skill.md');
    expect(result.type).toBe('skill');
    expect(result.warnings).toHaveLength(0);
  });

  it('reconstructs subagent from distinct agent slot directory', () => {
    const result = reconstructType('.claude/agents/my-agent.md', claudeCode, 'my-agent.md');
    expect(result.type).toBe('subagent');
    expect(result.warnings).toHaveLength(0);
  });

  it('reconstructs rule from destinationDir when no slot matches', () => {
    const result = reconstructType('.clinerules/my-rule.md', cline, 'my-rule.md');
    expect(result.type).toBe('rule');
    expect(result.warnings).toHaveLength(0);
  });

  it('reconstructs command from cursor command slot', () => {
    const result = reconstructType('.cursor/commands/my-cmd.md', cursor, 'my-cmd.md');
    expect(result.type).toBe('command');
  });

  it('emits ambiguity warning when agent slot dir == destinationDir (FR-015, FR-058)', () => {
    // For cline which has no distinct agent slot and only supports rules:
    // But let us construct a synthetic test with a descriptor where agent slot == dest dir
    const { adapter } = require('../../../../src/registry/adapters/build');
    const synthetic = adapter({
      id: 'synthetic-test',
      dir: '.synthetic/content',
      caps: { rule: true, subagent: true },
      // No distinct agent slot → agent slot falls back to destinationDir
    });
    const result = reconstructType('.synthetic/content/thing.md', synthetic, 'thing.md');
    expect(result.type).toBe('rule'); // documented default
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0].kind).toBe('defaulted-choice');
    expect(result.defaultedChoices.length).toBeGreaterThanOrEqual(1);
  });
});
