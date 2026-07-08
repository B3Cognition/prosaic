import { Registry } from './registry';
import { RegistryVersion } from './version';
import { verifiedTargets } from './conformance-status';

export interface ParityReport {
  registryVersion: string;
  rulerParityRef: string;
  parityBaseline: number;
  totalTargets: number;
  verifiedCount: number;
  meetsBaseline: boolean;
}

/**
 * The registry parity gate (T-037): record the release version plus the pinned
 * Ruler-parity reference (FR-007, NFR-011) and assert that at least the pinned
 * baseline number of targets are conformance-verified (NFR-008). `passing` maps
 * each target id to its passing conformance-test count (NFR-004).
 */
export function parityReport(registry: Registry, passing: Map<string, number>): ParityReport {
  const version: RegistryVersion = registry.version();
  const verified = verifiedTargets(passing);
  return {
    registryVersion: version.version,
    rulerParityRef: version.rulerParityRef,
    parityBaseline: version.parityBaseline,
    totalTargets: registry.all().length,
    verifiedCount: verified.size,
    meetsBaseline: verified.size >= version.parityBaseline,
  };
}
