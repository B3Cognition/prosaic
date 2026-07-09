import { Warning } from '../domain/warnings';
import { NeutralKey } from '../registry/descriptor';

/** Raised when the lossy policy is `error` and an intent cannot be represented. */
export class LossyTransformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LossyTransformError';
  }
}

/**
 * Build one warning per non-representable intent, naming the artifact, the
 * target, and the dropped intent (FR-018, FR-019, NFR-006). Non-representable
 * intent is never discarded silently. Under an `error` lossy policy this throws
 * instead of warning.
 */
export function lossyWarnings(
  dropped: NeutralKey[],
  artifactId: string,
  targetId: string,
  policy: 'warn' | 'error',
): Warning[] {
  if (dropped.length === 0) return [];

  if (policy === 'error') {
    throw new LossyTransformError(
      `Artifact "${artifactId}" declares intent [${dropped.join(', ')}] that target "${targetId}" cannot represent (lossyPolicy=error)`,
    );
  }

  return dropped.map((key) => ({
    kind: 'lossy-intent' as const,
    artifact: artifactId,
    target: targetId,
    message: `dropped non-representable intent "${key}"`,
  }));
}
