import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { neutralize } from '../../../src/import/neutralize/neutralize';
import { validateGate } from '../../../src/import/neutralize/validate-gate';
import { roundTrip, fidelityLevel } from '../../../src/import/verify/round-trip';
import { runPipeline } from '../../../src/pipeline/runner';
import { ALL_DESCRIPTORS } from '../../../src/registry/adapters';
import { adapter } from '../../../src/registry/adapters/build';
import { IMPORT_STABLE_TARGETS } from '../../../src/import/detect/parity';

const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;
const stableDescriptors = ALL_DESCRIPTORS.filter((d) => IMPORT_STABLE_TARGETS.has(d.id));

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'import-deterministic-nfr001.json');

const nfr001Results: Array<{ target: string; run1Fidelity: string; run2Fidelity: string; stable: boolean }> = [];

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'roundtrip-test-')));
}

describe('non-invertible target fidelity (SC-004)', () => {
  it('fidelityLevel is invertible-with-overrides for a target-specific non-neutral key (SC-004)', () => {
    const root = makeTempDir();
    try {
      // Descriptor with explicit passthrough (not '*'). 'source' is not in the
      // passthrough list, so it is not a neutral key — it goes to overrides with
      // a warning (0 silent loss). applyOverrides in stage 4 then re-injects it
      // during re-deploy, so the round-trip produces byte-identical output.
      const desc = adapter({
        id: 'test-sc004',
        dir: '.test-sc004/rules',
        passthrough: ['name'],
      });

      // Original file has a target-specific key 'source' not in neutral vocabulary
      const primaryContent = '---\nname: my-rule\nsource: foreign-tool\n---\n\nBody\n';
      const fileAbs = path.join(root, '.test-sc004', 'rules', 'my-rule.md');
      fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
      fs.writeFileSync(fileAbs, primaryContent);

      const relToRoot = path.relative(root, fileAbs).split(path.sep).join('/');
      const neutralResult = neutralize(fileAbs, relToRoot, desc, root);
      expect(neutralResult.ok).toBe(true);
      if (!neutralResult.ok) return;

      const { artifact, overrides, warnings: neutralWarnings } = neutralResult.result;

      // 'source' must be captured in overrides, not silently dropped (SC-004)
      expect(overrides['source']).toBe('foreign-tool');

      // At least 1 warning emitted — no silent loss (SC-004)
      expect(neutralWarnings.some((w) => w.kind === 'override-recovered')).toBe(true);

      const gated = validateGate(artifact, relToRoot);
      expect(gated.ok).toBe(true);
      if (!gated.ok) return;

      const { result: rtResult } = roundTrip(gated.artifact, desc, primaryContent, relToRoot);

      // applyOverrides in stage 4 re-injects overrides during re-deploy,
      // so the output matches the original byte-for-byte
      expect(rtResult.verified).toBe(true);

      const hasOverrides = Object.keys(overrides).length > 0;
      const fidelity = fidelityLevel(rtResult, hasOverrides);
      expect(fidelity).toBe('invertible-with-overrides');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('round-trip byte oracle (T-014, FR-036, FR-037, FR-038, FR-039, FR-070, FR-071, FR-023, FR-020, NFR-001)', () => {
  afterAll(() => {
    const spuriousDiffs = nfr001Results.filter((r) => !r.stable).length;
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-001',
          description: 'Deterministic round-trip rendering: identical inputs produce byte-identical output across repeated runs',
          pairsCompared: nfr001Results.length,
          spuriousDiffs,
          pass: spuriousDiffs === 0,
          results: nfr001Results,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });
  it('byte-identical round-trip yields verified=true, fidelity=fully-invertible (FR-037)', () => {
    const root = makeTempDir();
    try {
      // Create a prosaic-generated artifact, deploy it, then import it
      const artifact = {
        id: 'rules/my-rule.md',
        type: 'rule' as const,
        frontmatter: { name: 'my-rule' },
        body: 'This is my rule body.\n',
        sourcePath: 'rules/my-rule.md',
      };

      // Deploy to get the canonical foreign file
      const deployed = runPipeline(artifact, cline);
      const filePath = path.join(root, deployed.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, deployed.content);

      // Import it back
      const relToRoot = deployed.path;
      const neutralResult = neutralize(filePath, relToRoot, cline, root);
      expect(neutralResult.ok).toBe(true);
      if (!neutralResult.ok) return;

      const gated = validateGate(neutralResult.result.artifact, relToRoot);
      expect(gated.ok).toBe(true);
      if (!gated.ok) return;

      const { result: rtResult } = roundTrip(
        gated.artifact,
        cline,
        deployed.content,
        relToRoot,
      );

      expect(rtResult.verified).toBe(true);
      expect(rtResult.fidelity).toBe('fully-invertible');
      expect(rtResult.diffRegions).toHaveLength(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('normalized-equivalent: cosmetic-only differences pin fidelity to normalized-equivalent (FR-039, AC-010)', () => {
    const artifact = {
      id: 'rules/norm-rule.md',
      type: 'rule' as const,
      frontmatter: { name: 'norm-rule', description: 'Normalized equivalent rule' },
      body: 'Body line one.\nBody line two.\n',
      sourcePath: 'rules/norm-rule.md',
    };

    // Canonical re-deploy bytes for this artifact.
    const redeployed = runPipeline(artifact, cline, { lossyPolicy: 'warn' }).content;

    // A genuinely-foreign original that differs from canonical ONLY by cosmetic
    // whitespace the markdown normalizer collapses: trailing spaces on every line
    // and CRLF line endings. Raw bytes differ (>=1 byte) but the normalized forms
    // are equal, so the outcome must be exactly normalized-equivalent (FR-039) —
    // not a silent byte-identical pass and not an unexplained mismatch.
    const originalContent = redeployed.replace(/\n/g, '  \r\n');
    expect(originalContent).not.toBe(redeployed);

    const { result: rtResult } = roundTrip(artifact, cline, originalContent, 'rules/norm-rule.md');

    expect(rtResult.verified).toBe(false);
    expect(rtResult.fidelity).toBe('normalized-equivalent');
    expect(rtResult.diffRegions).toHaveLength(0);
  });

  it('genuine mismatch: forces a >=1 byte diff, records differing regions, warns, reports not verified (FR-038, FR-070, FR-071)', () => {
    const artifact = {
      id: 'rules/mismatch-rule.md',
      type: 'rule' as const,
      frontmatter: { name: 'mismatch-rule' },
      body: 'Re-deployed body that will not match the original.\n',
      sourcePath: 'rules/mismatch-rule.md',
    };

    // The original foreign file has a genuinely different body. After re-deploy the
    // output cannot match, and the difference is semantic (body text), not cosmetic
    // (whitespace / key order) — so it is a true mismatch, never normalized-equivalent.
    // This deterministically exercises the mismatch branch: assertions are unconditional.
    const originalContent =
      '---\nname: mismatch-rule\n---\n\nCompletely different original body line one.\nAnd an original second line.\n';

    const { result: rtResult, warnings } = roundTrip(
      artifact,
      cline,
      originalContent,
      'rules/mismatch-rule.md',
    );

    // FR-071: not verified; FR-038: fidelity is mismatch.
    expect(rtResult.verified).toBe(false);
    expect(rtResult.fidelity).toBe('mismatch');
    // FR-070: at least one differing region is recorded, naming original vs redeployed.
    expect(rtResult.diffRegions.length).toBeGreaterThanOrEqual(1);
    expect(rtResult.diffRegions.some((r) => r.original !== r.redeployed)).toBe(true);
    // FR-038: a round-trip-mismatch warning is emitted naming the artifact.
    const mismatchWarning = warnings.find((w) => w.kind === 'round-trip-mismatch');
    expect(mismatchWarning).toBeDefined();
    expect(mismatchWarning!.message).toContain('mismatch-rule.md');
  });

  it('deterministic re-deploy: 0 spurious diffs across repeated runs over all import-stable targets (NFR-001)', () => {
    for (const desc of stableDescriptors) {
      const root = makeTempDir();
      try {
        const artifact = {
          id: `rules/nfr001-${desc.id}.md`,
          type: 'rule' as const,
          frontmatter: { name: `nfr001-${desc.id}`, description: `Determinism fixture for ${desc.id}` },
          body: `# ${desc.id}\n\nDeterminism body.\n`,
          sourcePath: `rules/nfr001-${desc.id}.md`,
        };

        // Forward-deploy to obtain the canonical foreign file for this target.
        const deployed = runPipeline(artifact, desc, { lossyPolicy: 'warn' });
        const filePath = path.join(root, deployed.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, deployed.content);

        const relToRoot = deployed.path;
        const neutralResult = neutralize(filePath, relToRoot, desc, root);
        expect(neutralResult.ok).toBe(true);
        if (!neutralResult.ok) continue;
        const gated = validateGate(neutralResult.result.artifact, relToRoot);
        expect(gated.ok).toBe(true);
        if (!gated.ok) continue;

        // Repeat the round-trip re-deploy: identical inputs must yield an identical
        // outcome AND byte-identical re-deployed output (NFR-001, 0 spurious diffs).
        const { result: rt1 } = roundTrip(gated.artifact, desc, deployed.content, relToRoot);
        const { result: rt2 } = roundTrip(gated.artifact, desc, deployed.content, relToRoot);
        const redeploy1 = runPipeline(gated.artifact, desc, { lossyPolicy: 'warn' }).content;
        const redeploy2 = runPipeline(gated.artifact, desc, { lossyPolicy: 'warn' }).content;

        const stable =
          rt1.fidelity === rt2.fidelity &&
          rt1.verified === rt2.verified &&
          redeploy1 === redeploy2;
        nfr001Results.push({
          target: desc.id,
          run1Fidelity: rt1.fidelity,
          run2Fidelity: rt2.fidelity,
          stable,
        });

        expect(rt1.fidelity).toBe(rt2.fidelity);
        expect(rt1.verified).toBe(rt2.verified);
        expect(redeploy1).toBe(redeploy2);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }

    // Determinism is demonstrated across the full import-stable target set, not one pair.
    expect(nfr001Results.length).toBeGreaterThanOrEqual(IMPORT_STABLE_TARGETS.size);
    expect(nfr001Results.every((r) => r.stable)).toBe(true);
  });
});
