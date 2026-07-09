/**
 * Resolve a target's conformance-verified status (FR-009, FR-058). A target is
 * verified only when at least one conformance test pinning its expected on-disk
 * output passes; a target with zero passing tests is never verified (AC-025).
 */
export function isConformanceVerified(passingTestCount: number): boolean {
  return passingTestCount >= 1;
}

/**
 * Given a map of target id → number of passing conformance tests, return the set
 * of conformance-verified target ids. Used by the parity gate (T-037).
 */
export function verifiedTargets(passing: Map<string, number>): Set<string> {
  const out = new Set<string>();
  for (const [id, count] of passing) {
    if (isConformanceVerified(count)) out.add(id);
  }
  return out;
}
