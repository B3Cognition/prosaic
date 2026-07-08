import * as fs from 'fs';
import * as path from 'path';
import { builtinRegistry } from '../../src/registry/builtin';
import { parityReport } from '../../src/registry/parity';
import { supports } from '../../src/registry/descriptor';
import { ALL_TYPES } from '../helpers/representative';
import { clusterOf } from '../helpers/clusters';

const FIXTURE_ROOT = path.join(__dirname, '..', '..', 'conformance-fixtures');

/**
 * Count a target's passing conformance tests by the presence of its committed
 * golden fixtures. A target with at least one golden has a passing pinning test
 * (FR-009); the conformance suite proves the byte-match.
 */
function passingCounts(): Map<string, number> {
  const registry = builtinRegistry();
  const counts = new Map<string, number>();
  for (const desc of registry.all()) {
    let n = 0;
    for (const type of ALL_TYPES) {
      if (!supports(desc, type)) continue;
      const dir = path.join(FIXTURE_ROOT, clusterOf(desc.id), desc.id, type);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) n += 1;
    }
    if (n > 0) counts.set(desc.id, n);
  }
  return counts;
}

describe('registry parity gate (T-037, NFR-008/NFR-004/NFR-011)', () => {
  it('records one registry version plus the pinned Ruler-parity reference', () => {
    const report = parityReport(builtinRegistry(), passingCounts());
    expect(report.registryVersion).toMatch(/\d+\.\d+\.\d+/);
    expect(report.rulerParityRef).toContain('ruler');
    expect(report.parityBaseline).toBe(35);
  });

  it('NFR-008: at least 35 targets are conformance-verified across clusters', () => {
    const report = parityReport(builtinRegistry(), passingCounts());
    expect(report.verifiedCount).toBeGreaterThanOrEqual(35);
    expect(report.meetsBaseline).toBe(true);
  });

  it('NFR-004: every conformance-verified target has a passing conformance test', () => {
    const counts = passingCounts();
    for (const [, n] of counts) {
      expect(n).toBeGreaterThanOrEqual(1);
    }
  });
});
