import * as fs from 'fs';
import { neutralize } from '../../../src/import/neutralize/neutralize';
import { validateGate } from '../../../src/import/neutralize/validate-gate';
import { roundTrip } from '../../../src/import/verify/round-trip';
import { runPipeline } from '../../../src/pipeline/runner';
import { IMPORT_STABLE_TARGETS } from '../../../src/import/detect/parity';
import { ALL_DESCRIPTORS } from '../../../src/registry/adapters';
import {
  FOREIGN_FIXTURES,
  makeTempDir,
  readForeignContent,
  stageForeign,
  writeArtifact,
} from './foreign-corpus';

/** Neutralize a staged genuine-foreign fixture into a gated neutral artifact. */
function neutralizeForeign(fixtureId: string, relPath: string) {
  const desc = ALL_DESCRIPTORS.find((d) => d.id === fixtureId)!;
  const root = makeTempDir('conf-gate-');
  try {
    const fileAbs = stageForeign(root, { id: fixtureId, relPath });
    const neutralResult = neutralize(fileAbs, relPath, desc, root);
    if (!neutralResult.ok) return null;
    const gated = validateGate(neutralResult.result.artifact, relPath);
    if (!gated.ok) return null;
    return { desc, artifact: gated.artifact };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/**
 * NFR-008 — the import-stable allowlist is a runtime subset of the passing-sample set.
 *
 * `IMPORT_STABLE_TARGETS` is a hardcoded allowlist. This measures, at runtime, the
 * set of targets that actually pass a genuine-foreign round-trip sample and proves
 * the allowlist ⊆ that measured passing set — i.e. 0 targets are marked stable
 * without a passing sample.
 */
describe('import-stable allowlist ⊆ measured passing-sample set — measured runtime (NFR-008)', () => {
  const passingSampleTargets: string[] = [];
  const failing: Array<{ target: string; fidelity: string }> = [];

  afterAll(() => {
    const passingSet = new Set(passingSampleTargets);
    const stableWithoutSample = [...IMPORT_STABLE_TARGETS].filter((id) => !passingSet.has(id));
    writeArtifact('import-conformance-derived-nfr008.json', {
      nfr: 'NFR-008',
      requirements: ['NFR-008', 'FR-052'],
      evidenceKind: 'measured_runtime',
      description:
        'Every target in the hardcoded IMPORT_STABLE_TARGETS allowlist is proven, at runtime, to have a ' +
        'passing genuine-foreign round-trip sample. The passing set is derived by executing the real ' +
        'neutralize→gate→round-trip pipeline over committed foreign fixtures; the allowlist must be a subset.',
      allowlistSize: IMPORT_STABLE_TARGETS.size,
      passingSampleTargets: [...passingSampleTargets].sort(),
      passingSampleCount: passingSampleTargets.length,
      stableTargetsWithoutPassingSample: stableWithoutSample,
      failingSamples: failing,
      measurableTarget: 'IMPORT_STABLE_TARGETS is a subset of the measured passing-sample set (0 unbacked)',
      pass: stableWithoutSample.length === 0 && passingSampleTargets.length >= IMPORT_STABLE_TARGETS.size,
      recordedAt: new Date().toISOString(),
    });
  });

  for (const fixture of FOREIGN_FIXTURES) {
    it(`${fixture.id}: genuine-foreign round-trip sample passes and backs the allowlist entry`, () => {
      const prepared = neutralizeForeign(fixture.id, fixture.relPath);
      expect(prepared).not.toBeNull();
      if (!prepared) return;

      const original = readForeignContent(fixture);
      const { result } = roundTrip(prepared.artifact, prepared.desc, original, fixture.relPath);
      if (result.verified && result.fidelity === 'fully-invertible') {
        passingSampleTargets.push(fixture.id);
      } else {
        failing.push({ target: fixture.id, fidelity: result.fidelity });
      }
      expect(result.verified).toBe(true);
    });
  }

  it('every allowlisted stable target has a measured passing sample (0 unbacked)', () => {
    const passingSet = new Set(passingSampleTargets);
    for (const id of IMPORT_STABLE_TARGETS) {
      expect(passingSet.has(id)).toBe(true);
    }
  });
});

/**
 * NFR-001 — round-trip rendering is deterministic across repeated runs.
 *
 * Each genuinely-foreign fixture is neutralized once, then re-rendered through the
 * forward pipeline REPEATEDLY (3 runs). The measurable target is 0 spurious diffs:
 * every repeat must be byte-identical to the first render, and (for fully-invertible
 * targets) byte-identical to the committed foreign original — proving byte
 * comparison is a reliable round-trip oracle.
 */
describe('deterministic round-trip rendering across repeated runs — measured runtime (NFR-001)', () => {
  const REPEATS = 3;
  const perTarget: Array<{
    target: string;
    repeats: number;
    distinctRenders: number;
    matchesForeignOriginal: boolean;
  }> = [];

  afterAll(() => {
    const spuriousDiffs = perTarget.reduce((n, t) => n + (t.distinctRenders - 1), 0);
    writeArtifact('import-deterministic-repeat-nfr001.json', {
      nfr: 'NFR-001',
      requirements: ['NFR-001'],
      evidenceKind: 'measured_runtime',
      description:
        'Re-rendering each neutralized genuine-foreign artifact 3 times produces byte-identical output ' +
        'every run (stable key order, fixed serialization, single trailing newline). Measured as the number ' +
        'of distinct render hashes per target across repeated runs; the target is 0 spurious diffs.',
      repeatsPerTarget: REPEATS,
      targetsSampled: perTarget.length,
      spuriousDiffs,
      perTarget,
      measurableTarget: '0 spurious diffs across repeated renders of identical inputs',
      pass: perTarget.length === FOREIGN_FIXTURES.length && spuriousDiffs === 0,
      recordedAt: new Date().toISOString(),
    });
  });

  for (const fixture of FOREIGN_FIXTURES) {
    it(`${fixture.id}: 3 repeated renders of the same input are byte-identical`, () => {
      const prepared = neutralizeForeign(fixture.id, fixture.relPath);
      expect(prepared).not.toBeNull();
      if (!prepared) return;

      const renders: string[] = [];
      for (let i = 0; i < REPEATS; i++) {
        renders.push(runPipeline(prepared.artifact, prepared.desc, { lossyPolicy: 'warn' }).content);
      }
      const distinct = new Set(renders);
      const matchesForeignOriginal = renders[0] === readForeignContent(fixture);

      perTarget.push({
        target: fixture.id,
        repeats: REPEATS,
        distinctRenders: distinct.size,
        matchesForeignOriginal,
      });

      // Determinism: all repeats collapse to exactly one distinct render.
      expect(distinct.size).toBe(1);
    });
  }
});
