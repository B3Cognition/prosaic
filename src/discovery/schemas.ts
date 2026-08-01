import { z } from 'zod';
import { ArtifactType, Frontmatter } from '../domain/types';

/**
 * Neutral behavior vocabulary keys (Key Entity: Neutral Behavior Vocabulary).
 * These are author-once intents translated per target and stripped from output.
 */
const neutralExecution = z.enum(['command', 'skill', 'agent']).optional();
const neutralVisibility = z.enum(['user', 'hidden']).optional();

/**
 * Shared neutral fields permitted on any artifact. `.passthrough()` on the
 * per-type schemas lets targets carry through arbitrary extra frontmatter that
 * the descriptor's passthrough rule governs; strictness is enforced at the
 * config layer (FR-030), not per-artifact.
 */
const commonNeutral = {
  type: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  execution: neutralExecution,
  visibility: neutralVisibility,
  color: z.string().optional(),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
  effort: z.string().optional(),
  model_tier: z.string().optional(),
  invocation: z.string().optional(),
  capability: z.union([z.string(), z.array(z.string())]).optional(),
  overrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
};

const ruleSchema = z.object({ ...commonNeutral }).passthrough();

const skillSchema = z
  .object({
    ...commonNeutral,
    name: z.string({ required_error: 'skill requires a name' }).min(1),
    description: z.string({ required_error: 'skill requires a description' }).min(1),
  })
  .passthrough();

const subagentSchema = z
  .object({
    ...commonNeutral,
    name: z.string({ required_error: 'subagent requires a name' }).min(1),
    description: z.string({ required_error: 'subagent requires a description' }).min(1),
  })
  .passthrough();

const commandSchema = z
  .object({
    ...commonNeutral,
    description: z.string().optional(),
  })
  .passthrough();

const SCHEMAS: Record<ArtifactType, z.ZodType<any>> = {
  rule: ruleSchema,
  skill: skillSchema,
  subagent: subagentSchema,
  command: commandSchema,
};

export type SchemaResult =
  | { ok: true; frontmatter: Frontmatter }
  | { ok: false; field: string; reason: string };

/**
 * Validate an artifact's frontmatter against exactly one schema selected by its
 * artifact type (FR-003). On failure returns the failing field and reason so the
 * artifact is excluded from rendering with a precise report (FR-057, AC-021).
 */
export function validateFrontmatter(type: ArtifactType, frontmatter: Frontmatter): SchemaResult {
  const schema = SCHEMAS[type];
  const result = schema.safeParse(frontmatter);
  if (result.success) {
    return { ok: true, frontmatter: result.data as Frontmatter };
  }
  const first = result.error.issues[0];
  const field = first.path.length > 0 ? first.path.join('.') : '(root)';
  return { ok: false, field, reason: first.message };
}
