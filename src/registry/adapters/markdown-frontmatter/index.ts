import { TargetDescriptor } from '../../descriptor';
import { adapter } from '../build';

/**
 * High-reach Markdown-frontmatter cluster (T-044). The most widely used AI
 * coding tools that consume Markdown-with-YAML artifacts. Each descriptor is
 * populated from the OQ-001 contract matrix (see contract-matrix.md).
 */
export const markdownFrontmatterCluster: TargetDescriptor[] = [
  adapter({
    id: 'claude-code',
    label: 'Claude Code',
    dir: '.claude',
    caps: { rule: true, skill: true, subagent: true, command: true },
    slots: {
      command: { dir: '.claude/commands', extension: '.md' },
      skill: { dir: '.claude/skills', extension: '.md' },
      agent: { dir: '.claude/agents', extension: '.md' },
    },
    translations: {
      tools: { toKey: 'tools' },
      color: { toKey: 'color' },
    },
    argumentToken: '$ARGUMENTS',
  }),
  adapter({
    id: 'cursor',
    label: 'Cursor',
    dir: '.cursor/rules',
    extension: '.mdc',
    caps: { rule: true, command: true },
    slots: { command: { dir: '.cursor/commands', extension: '.md' } },
    argumentToken: '$ARGUMENTS',
  }),
  adapter({
    id: 'windsurf',
    label: 'Windsurf',
    dir: '.windsurf/rules',
    caps: { rule: true, command: true },
    slots: { command: { dir: '.windsurf/workflows', extension: '.md' } },
  }),
  adapter({
    id: 'cline',
    label: 'Cline',
    dir: '.clinerules',
    caps: { rule: true },
  }),
  adapter({
    id: 'roo-code',
    label: 'Roo Code',
    dir: '.roo/rules',
    caps: { rule: true },
  }),
  adapter({
    id: 'kilo-code',
    label: 'Kilo Code',
    dir: '.kilocode/rules',
    caps: { rule: true, command: true },
    slots: { command: { dir: '.kilocode/workflows', extension: '.md' } },
  }),
  adapter({
    id: 'continue',
    label: 'Continue',
    dir: '.continue/rules',
    caps: { rule: true },
  }),
  adapter({
    id: 'zed',
    label: 'Zed',
    dir: '.rules',
    caps: { rule: true },
  }),
  adapter({
    id: 'aider',
    label: 'Aider',
    dir: '.aider/rules',
    caps: { rule: true },
  }),
  adapter({
    id: 'amazon-q',
    label: 'Amazon Q Developer',
    dir: '.amazonq/rules',
    caps: { rule: true },
  }),
];
