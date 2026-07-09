/**
 * Structured warning categories. Every skipped or lossy transformation must
 * surface at least one warning naming the artifact and target so a run has zero
 * silent skips or silent capability losses (NFR-006, FR-005, FR-018, FR-039).
 */
export type WarningKind =
  | 'malformed-frontmatter'
  | 'schema-invalid'
  | 'classification'
  | 'unsupported-pair'
  | 'lossy-intent'
  | 'unresolved-reference'
  | 'config';

export interface Warning {
  kind: WarningKind;
  message: string;
  /** Artifact id/path when the warning concerns a specific artifact. */
  artifact?: string;
  /** Target identifier when the warning concerns a specific target. */
  target?: string;
}

/**
 * Accumulates warnings across a whole run so 100% of them are reported without
 * aborting on the first invalid artifact (FR-005, NFR-010).
 */
export class WarningCollector {
  private readonly items: Warning[] = [];

  add(w: Warning): void {
    this.items.push(w);
  }

  addAll(ws: Warning[]): void {
    for (const w of ws) this.items.push(w);
  }

  all(): Warning[] {
    return [...this.items];
  }

  byKind(kind: WarningKind): Warning[] {
    return this.items.filter((w) => w.kind === kind);
  }

  get count(): number {
    return this.items.length;
  }

  /** Human-readable lines, one per warning, for CLI reporting. */
  format(): string[] {
    return this.items.map((w) => {
      const where = [w.artifact, w.target].filter(Boolean).join(' → ');
      return where ? `warning[${w.kind}] ${where}: ${w.message}` : `warning[${w.kind}] ${w.message}`;
    });
  }
}
