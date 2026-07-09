import { Artifact } from '../../domain/types';
import { Warning } from '../../domain/warnings';
import { validateFrontmatter } from '../../discovery/schemas';

export type GateResult =
  | { ok: true; artifact: Artifact }
  | { ok: false; warnings: Warning[] };

/**
 * Gate every reconstructed neutral artifact through the per-type neutral frontmatter
 * validator before allowing a write (FR-030, FR-066).
 *
 * A validation failure drops the artifact and emits 1 warning instead of writing
 * invalid source (FR-066). The caller must treat ok:false as a drop-with-warning.
 */
export function validateGate(artifact: Artifact, foreignPath: string): GateResult {
  const result = validateFrontmatter(artifact.type, artifact.frontmatter);
  if (result.ok) {
    return { ok: true, artifact: { ...artifact, frontmatter: result.frontmatter } };
  }

  return {
    ok: false,
    warnings: [
      {
        kind: 'schema-invalid',
        artifact: foreignPath,
        message:
          `Reconstructed neutral artifact from "${foreignPath}" failed ${artifact.type} frontmatter ` +
          `validation at field "${result.field}": ${result.reason}. Dropping artifact (0 files written).`,
      },
    ],
  };
}
