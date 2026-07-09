/**
 * Exactly one version identifier per target-registry release (FR-007, NFR-011).
 * The pinned Ruler-parity reference is recorded alongside so contract changes
 * are traceable per release (NFR-008 baseline provenance).
 */
export interface RegistryVersion {
  version: string;
  /** The pinned Ruler reference version this registry is parity-matched against. */
  rulerParityRef: string;
  /** The pinned parity target count (NFR-008). */
  parityBaseline: number;
}

export const REGISTRY_VERSION: RegistryVersion = {
  version: '1.0.0',
  rulerParityRef: 'ruler@0.4.0',
  parityBaseline: 35,
};
