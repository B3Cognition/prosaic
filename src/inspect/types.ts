import { ArtifactType, Frontmatter } from '../domain/types';
import { CliOverrides } from '../config/cli-override';

/** A bundled resource file exposed by inspect (FR-011, FR-024). */
export interface InspectedResource {
  /** POSIX path relative to `bundleRoot` — never absolute (FR-011). */
  relPath: string;
  /** Full raw content, never truncated (FR-024). */
  content: string;
}

/** The full data returned for a single successfully inspected artifact. */
export interface InspectedArtifact {
  id: string;
  type: ArtifactType;
  frontmatter: Frontmatter;
  body: string;
  /** Absolute filesystem path, or null for a standalone artifact (FR-012/FR-014, ADR-002). */
  bundleRoot: string | null;
  /** Always present, `[]` when the artifact has no bundled resources (FR-013). */
  resources: InspectedResource[];
}

/** The discriminated success-or-failure result of a single inspect invocation (FR-004). */
export type InspectionResult =
  | { ok: true; data: InspectedArtifact }
  | { ok: false; errorKind: 'artifact-not-found'; artifactId: string; message: string }
  | { ok: false; errorKind: 'internal'; message: string };

/** Input to `inspectArtifact()`. No target-tool selection field (FR-016, ADR-005). */
export interface InspectOptions {
  projectRoot: string;
  artifactId: string;
  cli?: CliOverrides;
}
