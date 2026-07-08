import { z } from 'zod';
import { ArtifactType, DeploymentType } from '../domain/types';

/** Serialization formats a target may require (FR-045, FR-020). */
export const SERIALIZATION_FORMATS = ['markdown', 'toml', 'yaml'] as const;
export type SerializationFormat = (typeof SERIALIZATION_FORMATS)[number];

/** Neutral behavior vocabulary keys (Key Entity: Neutral Behavior Vocabulary). */
export const NEUTRAL_KEYS = [
  'execution',
  'capability',
  'effort',
  'tools',
  'invocation',
  'visibility',
  'color',
] as const;
export type NeutralKey = (typeof NEUTRAL_KEYS)[number];

/** How a neutral intent translates to one target's concrete frontmatter (FR-015). */
const neutralTranslationSchema = z.object({
  /** Concrete frontmatter key to emit; omit `toKey` to mark the intent non-representable (FR-018). */
  toKey: z.string().optional(),
  /** Optional neutral-value → concrete-value mapping. */
  valueMap: z.record(z.string(), z.unknown()).optional(),
  /** When true, the intent is explicitly non-representable and always warns. */
  drop: z.boolean().optional(),
});
export type NeutralTranslation = z.infer<typeof neutralTranslationSchema>;

/** Naming rule that yields one on-disk base name per artifact (FR-013). */
const namingSchema = z.object({
  /** Derive the base name from the frontmatter `name` or the source file name. */
  from: z.enum(['name', 'filename']).default('filename'),
  /** Case transform applied to the base name. */
  casing: z.enum(['kebab', 'snake', 'original']).default('original'),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});
export type NamingRule = z.infer<typeof namingSchema>;

/** Per-deployment-type native slot (FR-023): where + how each type lands. */
const slotSchema = z.object({
  dir: z.string(),
  extension: z.string().optional(),
  naming: namingSchema.partial().optional(),
});
export type SlotRule = z.infer<typeof slotSchema>;

/** A companion file written alongside the primary output (FR-022). */
const companionSchema = z.object({
  /** File name template; `{name}` expands to the primary base name. */
  nameTemplate: z.string(),
  /** Static content, or `{body}` / `{name}` template tokens. */
  content: z.string(),
});
export type CompanionRule = z.infer<typeof companionSchema>;

/** Three frontmatter rule categories: strip, passthrough, inject (FR-046). */
const frontmatterRulesSchema = z.object({
  strip: z.array(z.string()).default([]),
  /** Explicit key list or "*" to pass through every remaining key. */
  passthrough: z.union([z.literal('*'), z.array(z.string())]).default('*'),
  inject: z.record(z.string(), z.unknown()).default({}),
});
export type FrontmatterRules = z.infer<typeof frontmatterRulesSchema>;

export const descriptorSchema = z.object({
  /** Unique target identifier (FR-006). */
  id: z.string().min(1),
  /** Human label for reporting. */
  label: z.string().optional(),
  /** Exactly one destination directory (FR-044). */
  destinationDir: z.string().min(1),
  /** Exactly one serialization format (FR-045). */
  format: z.enum(SERIALIZATION_FORMATS),
  /** File extension for the primary output. */
  extension: z.string().min(1),
  /** Exactly one argument token used for placeholder rewrite (FR-045, FR-014). */
  argumentToken: z.string().min(1),
  /** The three frontmatter rule categories (FR-046). */
  frontmatter: frontmatterRulesSchema,
  /** At least one native-support capability flag per artifact type (FR-047). */
  capabilities: z.object({
    rule: z.boolean(),
    skill: z.boolean(),
    subagent: z.boolean(),
    command: z.boolean(),
  }),
  /** Default naming rule (FR-013). */
  naming: namingSchema.default({ from: 'filename', casing: 'original' }),
  /** Per-deployment-type slots (FR-023); falls back to destinationDir when absent. */
  slots: z
    .object({
      command: slotSchema.optional(),
      skill: slotSchema.optional(),
      agent: slotSchema.optional(),
    })
    .optional(),
  /** Neutral-vocabulary translation rules (FR-015). */
  translations: z
    .object({
      execution: neutralTranslationSchema.optional(),
      capability: neutralTranslationSchema.optional(),
      effort: neutralTranslationSchema.optional(),
      tools: neutralTranslationSchema.optional(),
      invocation: neutralTranslationSchema.optional(),
      visibility: neutralTranslationSchema.optional(),
      color: neutralTranslationSchema.optional(),
    })
    .default({}),
  /** Companion files written next to the primary output (FR-022). */
  companions: z.array(companionSchema).optional(),
  /** For structured formats: how the body maps into a field (FR-020, FR-014). */
  bodyField: z.string().optional(),
  /** Argument-placeholder patterns to rewrite (defaults applied by the pipeline). */
  argumentPlaceholders: z.array(z.string()).optional(),
});

export type TargetDescriptor = z.infer<typeof descriptorSchema>;

export interface DescriptorValidation {
  ok: boolean;
  error?: string;
}

/** Validate a descriptor object against the schema; a missing field is a hard error. */
export function validateDescriptor(raw: unknown): DescriptorValidation {
  const result = descriptorSchema.safeParse(raw);
  if (result.success) return { ok: true };
  const first = result.error.issues[0];
  const field = first.path.join('.') || '(root)';
  return { ok: false, error: `descriptor field "${field}": ${first.message}` };
}

/** Parse-or-throw helper used when loading built-in descriptors. */
export function parseDescriptor(raw: unknown): TargetDescriptor {
  return descriptorSchema.parse(raw);
}

/** Whether a target natively supports an artifact type (FR-010, FR-047). */
export function supports(desc: TargetDescriptor, type: ArtifactType): boolean {
  return desc.capabilities[type] === true;
}

/** The native slot for a deployment type, or the default from destinationDir. */
export function slotFor(desc: TargetDescriptor, dt: DeploymentType): SlotRule {
  const slot = desc.slots?.[dt];
  if (slot) return slot;
  return { dir: desc.destinationDir, extension: desc.extension };
}
