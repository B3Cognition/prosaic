import { TargetDescriptor } from '../../descriptor';
import { adapter } from '../build';

/**
 * Long-tail Markdown cluster (T-048). The remaining Markdown-frontmatter targets
 * needed to reach the pinned Ruler-parity baseline of at least 35 conformance-
 * verified targets (NFR-008). Each is a declarative descriptor from the OQ-001
 * contract matrix; adding one is a data edit (FR-008).
 */
export const markdownLongtailCluster: TargetDescriptor[] = [
  adapter({ id: 'agents-md', label: 'AGENTS.md (generic)', dir: '.', naming: { from: 'filename', casing: 'original' }, caps: { rule: true } }),
  adapter({ id: 'openhands', label: 'OpenHands', dir: '.openhands/microagents', caps: { rule: true } }),
  adapter({ id: 'crush', label: 'Crush', dir: '.crush/rules', caps: { rule: true } }),
  adapter({ id: 'qwen-code', label: 'Qwen Code', dir: '.qwen/rules', caps: { rule: true, command: true }, slots: { command: { dir: '.qwen/commands', extension: '.md' } } }),
  adapter({ id: 'opencode', label: 'OpenCode', dir: '.opencode/rules', caps: { rule: true, command: true }, slots: { command: { dir: '.opencode/command', extension: '.md' } } }),
  adapter({ id: 'kiro', label: 'Kiro', dir: '.kiro/steering', caps: { rule: true } }),
  adapter({ id: 'antigravity', label: 'Antigravity', dir: '.antigravity/rules', caps: { rule: true } }),
  adapter({ id: 'cody', label: 'Sourcegraph Cody', dir: '.sourcegraph/rules', caps: { rule: true } }),
  adapter({ id: 'tabnine', label: 'Tabnine', dir: '.tabnine/rules', caps: { rule: true } }),
  adapter({ id: 'pearai', label: 'PearAI', dir: '.pearai/rules', caps: { rule: true } }),
  adapter({ id: 'void', label: 'Void', dir: '.void/rules', caps: { rule: true } }),
  adapter({ id: 'augmentcode', label: 'Augment Code', dir: '.augment/rules', caps: { rule: true } }),
  adapter({ id: 'trae', label: 'Trae', dir: '.trae/rules', caps: { rule: true } }),
  adapter({ id: 'jules', label: 'Jules', dir: '.jules/rules', caps: { rule: true } }),
  adapter({ id: 'junie', label: 'Junie', dir: '.junie/guidelines', caps: { rule: true } }),
  adapter({ id: 'warp', label: 'Warp', dir: '.warp/rules', caps: { rule: true } }),
  adapter({ id: 'firebase-studio', label: 'Firebase Studio', dir: '.idx/airules', caps: { rule: true } }),
  adapter({ id: 'gemini-code-assist', label: 'Gemini Code Assist', dir: '.gemini/rules', caps: { rule: true } }),
  adapter({ id: 'bolt', label: 'Bolt', dir: '.bolt/rules', caps: { rule: true } }),
  adapter({ id: 'replit', label: 'Replit Agent', dir: '.replit/rules', caps: { rule: true } }),
  adapter({ id: 'aide', label: 'Aide', dir: '.aide/rules', caps: { rule: true } }),
  adapter({ id: 'melty', label: 'Melty', dir: '.melty/rules', caps: { rule: true } }),
  adapter({ id: 'windsurf-next', label: 'Windsurf Next', dir: '.windsurf-next/rules', caps: { rule: true } }),
  adapter({ id: 'devin', label: 'Devin', dir: '.devin/rules', caps: { rule: true } }),
  adapter({ id: 'sweep', label: 'Sweep', dir: '.sweep/rules', caps: { rule: true } }),
  adapter({ id: 'q-cli', label: 'Q CLI', dir: '.q/rules', caps: { rule: true, command: true }, slots: { command: { dir: '.q/commands', extension: '.md' } } }),
];
