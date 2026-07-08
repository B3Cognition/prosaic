import { TargetDescriptor, parseDescriptor } from '../descriptor';
import { ArtifactType } from '../../domain/types';

type Caps = Partial<Record<ArtifactType, boolean>>;

export interface AdapterSpec {
  id: string;
  label?: string;
  dir: string;
  format?: 'markdown' | 'toml' | 'yaml';
  extension?: string;
  argumentToken?: string;
  caps?: Caps;
  strip?: string[];
  passthrough?: '*' | string[];
  inject?: Record<string, unknown>;
  naming?: TargetDescriptor['naming'];
  slots?: TargetDescriptor['slots'];
  translations?: TargetDescriptor['translations'];
  companions?: TargetDescriptor['companions'];
  bodyField?: string;
}

/** Default capability set: rules everywhere, commands common, skills/agents opt-in. */
function caps(over?: Caps) {
  return {
    rule: over?.rule ?? true,
    skill: over?.skill ?? false,
    subagent: over?.subagent ?? false,
    command: over?.command ?? false,
  };
}

/**
 * Compact declarative adapter builder used by the per-format clusters. Fills the
 * common descriptor defaults so each target is a small data literal (FR-006);
 * adding a target is a data edit, not code (FR-008).
 */
export function adapter(spec: AdapterSpec): TargetDescriptor {
  return parseDescriptor({
    id: spec.id,
    label: spec.label ?? spec.id,
    destinationDir: spec.dir,
    format: spec.format ?? 'markdown',
    extension: spec.extension ?? '.md',
    argumentToken: spec.argumentToken ?? '$ARGUMENTS',
    frontmatter: {
      strip: spec.strip ?? [],
      passthrough: spec.passthrough ?? '*',
      inject: spec.inject ?? {},
    },
    capabilities: caps(spec.caps),
    naming: spec.naming ?? { from: 'filename', casing: 'original' },
    slots: spec.slots,
    translations: spec.translations ?? {},
    companions: spec.companions,
    bodyField: spec.bodyField,
  });
}
