import { TargetDescriptor } from '../../descriptor';
import { adapter } from '../build';

/**
 * Companion-file cluster (T-047). Targets whose contract requires a companion
 * file alongside the primary output (e.g. GitHub Copilot prompt files ship a
 * `.prompt.md` next to instructions). Every companion is written alongside the
 * primary output (FR-022).
 */
export const companionFileCluster: TargetDescriptor[] = [
  adapter({
    id: 'github-copilot',
    label: 'GitHub Copilot',
    dir: '.github/instructions',
    extension: '.instructions.md',
    caps: { rule: true, command: true },
    slots: { command: { dir: '.github/prompts', extension: '.prompt.md' } },
    inject: { applyTo: '**' },
    companions: [
      {
        nameTemplate: '{name}.metadata.json',
        content: '{\n  "source": "prosaic",\n  "name": "{name}"\n}\n',
      },
    ],
  }),
];
