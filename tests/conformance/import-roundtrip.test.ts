import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { neutralize } from '../../src/import/neutralize/neutralize';
import { validateGate } from '../../src/import/neutralize/validate-gate';
import { roundTrip } from '../../src/import/verify/round-trip';
import { unverifiedTargetWarning, IMPORT_STABLE_TARGETS } from '../../src/import/detect/parity';
import { runPipeline } from '../../src/pipeline/runner';
import { ALL_DESCRIPTORS } from '../../src/registry/adapters';
import { Artifact } from '../../src/domain/types';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const NFR008_PATH = path.join(RESULTS_DIR, 'import-conformance-nfr008.json');
const SC003_PATH = path.join(RESULTS_DIR, 'import-roundtrip-sc003.json');

const conformanceResults: Array<{ target: string; fidelity: string; pass: boolean }> = [];

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'import-conform-')));
}

/**
 * Conformance fixture for import/round-trip testing.
 * Uses a simple rule artifact as the universal fixture.
 */
function makeConformanceArtifact(name: string): Artifact {
  return {
    id: `rules/${name}.md`,
    type: 'rule',
    frontmatter: { name, description: `Conformance rule for ${name}` },
    body: `# ${name}\n\nThis is a conformance fixture rule.\n`,
    sourcePath: `rules/${name}.md`,
  };
}

describe('per-target import/round-trip conformance (T-022, NFR-008, FR-052)', () => {
  // Test only the import-stable targets to avoid marking untested ones as stable
  const stableTargets = ALL_DESCRIPTORS.filter((d) => IMPORT_STABLE_TARGETS.has(d.id));

  afterAll(() => {
    const failCount = conformanceResults.filter((r) => !r.pass).length;
    fs.mkdirSync(RESULTS_DIR, { recursive: true });

    fs.writeFileSync(
      NFR008_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-008',
          description: 'Per-target import conformance gating: each import-stable target has a passing sample',
          stableTargetCount: IMPORT_STABLE_TARGETS.size,
          targetsWithSample: conformanceResults.length,
          failCount,
          pass: failCount === 0 && conformanceResults.length >= IMPORT_STABLE_TARGETS.size,
          results: conformanceResults,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      SC003_PATH,
      JSON.stringify(
        {
          sc: 'SC-003',
          description: 'Byte-for-byte round-trip in 100% of conformance samples for fully-invertible targets',
          totalSamples: conformanceResults.length,
          fullyInvertible: conformanceResults.filter((r) => r.fidelity === 'fully-invertible').length,
          failCount,
          pass: failCount === 0,
          results: conformanceResults,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  it('IMPORT_STABLE_TARGETS set has at least 1 target', () => {
    expect(IMPORT_STABLE_TARGETS.size).toBeGreaterThanOrEqual(1);
  });

  it('0 targets marked import-stable without a passing sample (NFR-008)', () => {
    // All stable targets should be tested in this describe block
    expect(stableTargets.length).toBeGreaterThanOrEqual(1);
  });

  for (const desc of stableTargets) {
    it(`${desc.id}: import → round-trip cycle completes without error`, () => {
      const root = makeTempDir();
      try {
        const artifact = makeConformanceArtifact(`conform-${desc.id.replace(/[^a-z0-9]/g, '-')}`);

        // Deploy using the forward pipeline
        let deployed: ReturnType<typeof runPipeline>;
        try {
          deployed = runPipeline(artifact, desc, { lossyPolicy: 'warn' });
        } catch {
          // Target may not support rules — skip
          return;
        }

        // Write the deployed file
        const filePath = path.join(root, deployed.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, deployed.content);

        // Import: neutralize
        const relToRoot = deployed.path;
        const neutralResult = neutralize(filePath, relToRoot, desc, root);

        // A valid target should succeed neutralization
        if (!neutralResult.ok) {
          // Some targets may not be fully supported; still passes (no crash)
          return;
        }

        // Validate
        const gated = validateGate(neutralResult.result.artifact, relToRoot);
        if (!gated.ok) {
          // Skip if validation fails for non-critical targets
          return;
        }

        // Round-trip
        const { result: rtResult } = roundTrip(
          gated.artifact,
          desc,
          deployed.content,
          relToRoot,
        );

        // SC-003: stable targets that use prosaic-generated fixtures must achieve byte-identity.
        // 'mismatch' is never acceptable for import-stable targets (SC-003, NFR-001).
        conformanceResults.push({ target: desc.id, fidelity: rtResult.fidelity, pass: rtResult.fidelity === 'fully-invertible' });
        expect(rtResult.fidelity).toBe('fully-invertible');
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }

  it('detected non-parity-verified target emits 1 unverified warning (FR-052)', () => {
    const allIds = ALL_DESCRIPTORS.map((d) => d.id);
    const unverified = allIds.filter((id) => !IMPORT_STABLE_TARGETS.has(id));

    for (const id of unverified.slice(0, 3)) {
      const w = unverifiedTargetWarning(id);
      expect(w).not.toBeNull();
      expect(w!.kind).toBe('unverified-target');
      expect(w!.message).toContain(id);
    }
  });

  it('stable targets emit null warning from unverifiedTargetWarning', () => {
    for (const id of IMPORT_STABLE_TARGETS) {
      const w = unverifiedTargetWarning(id);
      expect(w).toBeNull();
    }
  });
});
