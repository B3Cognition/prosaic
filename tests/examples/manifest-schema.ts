import * as fs from 'fs';
import { z } from 'zod';

/**
 * Strict schema for `examples/<id>/example.manifest.json`, per data-model.md's
 * Example Manifest entity. Unknown keys are a hard error, mirroring
 * `src/config/schema.ts`'s `.strict()` idiom.
 */
export const exampleManifestStepSchema = z
  .object({
    args: z.array(z.string().min(1)).min(1),
    expectedOutputFile: z.string().min(1),
    expectedExitCode: z.number().int(),
    nonHappyPath: z.boolean(),
  })
  .strict();

export const exampleManifestSchema = z
  .object({
    exampleId: z.string().min(1),
    steps: z.array(exampleManifestStepSchema).min(1),
  })
  .strict();

export type ExampleManifestStep = z.infer<typeof exampleManifestStepSchema>;
export type ExampleManifest = z.infer<typeof exampleManifestSchema>;

export interface LoadManifestOptions {
  /** MVP-tier Examples require at least one `nonHappyPath: true` step (FR-018). */
  requireNonHappyPath: boolean;
}

/**
 * Parse and validate a manifest file at `manifestPath`. Throws a descriptive
 * error on schema violation or on a missing non-happy-path step when required;
 * a missing manifest *file* is a separate case callers handle themselves
 * (the Example Verification Check's coverage-gap path).
 */
export function loadManifest(manifestPath: string, options: LoadManifestOptions): ExampleManifest {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(raw);
  const result = exampleManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid example manifest at ${manifestPath}: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  const manifest = result.data;
  const nonHappyPathStepCount = manifest.steps.filter((step) => step.nonHappyPath).length;
  if (options.requireNonHappyPath && nonHappyPathStepCount < 1) {
    throw new Error(
      `Invalid example manifest at ${manifestPath}: MVP-tier examples require at least one ` +
        `step with nonHappyPath: true (FR-018), found ${nonHappyPathStepCount}`,
    );
  }
  return manifest;
}
