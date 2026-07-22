import { ArtifactType } from '../domain/types';
import { TargetDescriptor, supports, runtimeCapabilityFor, RuntimeCapabilityDeclaration } from './descriptor';
import { RegistryVersion, REGISTRY_VERSION } from './version';

/** Raised when a selected target identifier is absent from the registry (FR-040). */
export class UnknownTargetError extends Error {
  constructor(public readonly targetId: string) {
    super(`Unknown target: "${targetId}" is not in the target registry`);
    this.name = 'UnknownTargetError';
  }
}

/**
 * A registry source seam (ADR-002, ADR-011). The built-in descriptor set is one
 * source; a remote catalog (T-040) is another, so breadth grows as data behind
 * the same interface.
 */
export interface RegistrySource {
  descriptors(): TargetDescriptor[];
  version(): RegistryVersion;
}

/**
 * Registry lookup over a source seam: resolve by id, list all, and answer
 * whether a target natively supports an artifact type, exposing 100% of the
 * capability flags to the transformation stage (FR-010). Carries exactly one
 * version identifier per release (FR-007, NFR-011).
 */
export class Registry {
  private readonly byId: Map<string, TargetDescriptor>;

  constructor(private readonly source: RegistrySource) {
    this.byId = new Map();
    for (const d of source.descriptors()) {
      if (this.byId.has(d.id)) {
        throw new Error(`Duplicate target id in registry: ${d.id}`);
      }
      this.byId.set(d.id, d);
    }
  }

  version(): RegistryVersion {
    return this.source.version();
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Resolve a descriptor or throw UnknownTargetError (FR-040). */
  get(id: string): TargetDescriptor {
    const d = this.byId.get(id);
    if (!d) throw new UnknownTargetError(id);
    return d;
  }

  all(): TargetDescriptor[] {
    return [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  ids(): string[] {
    return this.all().map((d) => d.id);
  }

  /** Whether a target natively supports an artifact type (FR-010, FR-047). */
  supports(id: string, type: ArtifactType): boolean {
    return supports(this.get(id), type);
  }

  /** A registered target's runtime-invocation capability (FR-012, AC-010, AC-011). */
  runtimeCapability(id: string): RuntimeCapabilityDeclaration {
    return runtimeCapabilityFor(this.get(id));
  }

  /**
   * Resolve the effective target id list from a selection ("all" or explicit).
   * An explicit id absent from the registry throws UnknownTargetError before any
   * write (FR-040, FR-064).
   */
  resolveSelection(selection: 'all' | string[]): TargetDescriptor[] {
    if (selection === 'all') return this.all();
    return selection.map((id) => this.get(id));
  }
}

/** In-memory registry source, used for tests and for admitting a new target. */
export class StaticRegistrySource implements RegistrySource {
  constructor(
    private readonly descs: TargetDescriptor[],
    private readonly ver: RegistryVersion = REGISTRY_VERSION,
  ) {}
  descriptors(): TargetDescriptor[] {
    return this.descs;
  }
  version(): RegistryVersion {
    return this.ver;
  }
}
