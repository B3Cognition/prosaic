import { TargetDescriptor } from '../../descriptor';
import { adapter } from '../build';

/**
 * TOML command-format cluster (T-045). Targets whose command contract requires
 * TOML serialization. The canonical TOML wrapper keeps fixtures deterministic
 * (NFR-009). The body maps into the `prompt` field.
 */
export const tomlCommandCluster: TargetDescriptor[] = [
  adapter({
    id: 'codex-cli',
    label: 'OpenAI Codex CLI',
    dir: '.codex/prompts',
    format: 'toml',
    extension: '.toml',
    bodyField: 'prompt',
    argumentToken: '$ARGUMENTS',
    caps: { rule: false, command: true },
  }),
  adapter({
    id: 'gemini-cli',
    label: 'Gemini CLI',
    dir: '.gemini/commands',
    format: 'toml',
    extension: '.toml',
    bodyField: 'prompt',
    argumentToken: '{{args}}',
    caps: { rule: false, command: true },
  }),
];
