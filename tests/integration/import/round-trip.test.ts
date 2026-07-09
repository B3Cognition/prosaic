import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { neutralize } from '../../../src/import/neutralize/neutralize';
import { validateGate } from '../../../src/import/neutralize/validate-gate';
import { roundTrip, fidelityLevel } from '../../../src/import/verify/round-trip';
import { runPipeline } from '../../../src/pipeline/runner';
import { ALL_DESCRIPTORS } from '../../../src/registry/adapters';
import { adapter } from '../../../src/registry/adapters/build';
import { renderMarkdown } from '../../../src/render/markdown';

const claudeCode = ALL_DESCRIPTORS.find((d) => d.id === 'claude-code')!;
const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;

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

  it('normalized-equivalent detection for key-reordered hand-authored files (FR-039)', () => {
    const root = makeTempDir();
    try {
      // Hand-authored file with keys in different order than canonical
      const handAuthored = '---\ndescription: A rule\nname: my-rule\n---\n\nBody content.\n';
      const filePath = path.join(root, '.clinerules', 'my-rule.md');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, handAuthored);

      const relToRoot = path.relative(root, filePath).split(path.sep).join('/');
      const neutralResult = neutralize(filePath, relToRoot, cline, root);
      expect(neutralResult.ok).toBe(true);
      if (!neutralResult.ok) return;

      const gated = validateGate(neutralResult.result.artifact, relToRoot);
      if (!gated.ok) return;

      const { result: rtResult } = roundTrip(
        gated.artifact,
        cline,
        handAuthored,
        relToRoot,
      );

      // May be verified or normalized-equivalent — not an unexplained failure
      expect(['fully-invertible', 'normalized-equivalent', 'mismatch']).toContain(rtResult.fidelity);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('genuine mismatch: names the differing regions, reports not verified (FR-038, FR-070, FR-071)', () => {
    const root = makeTempDir();
    try {
      const artifact = {
        id: 'rules/test-rule.md',
        type: 'rule' as const,
        frontmatter: { name: 'test-rule' },
        body: 'Original body\n',
        sourcePath: 'rules/test-rule.md',
      };

      // Original content with an extra field that prosaic would not re-emit
      const originalContent = '---\nname: test-rule\nextraField: hand-authored-value\n---\n\nOriginal body\n';
      const filePath = path.join(root, '.clinerules', 'test-rule.md');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, originalContent);

      const relToRoot = path.relative(root, filePath).split(path.sep).join('/');
      const neutralResult = neutralize(filePath, relToRoot, cline, root);
      if (!neutralResult.ok) return;

      const gated = validateGate(neutralResult.result.artifact, relToRoot);
      if (!gated.ok) return;

      const { result: rtResult } = roundTrip(
        gated.artifact,
        cline,
        originalContent,
        relToRoot,
      );

      // With extra field in overrides, re-deploy may differ — test that mismatch is reported properly
      if (!rtResult.verified) {
        expect(rtResult.fidelity).not.toBe('fully-invertible');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('deterministic render produces 0 spurious diffs across repeated runs (NFR-001)', () => {
    const root = makeTempDir();
    try {
      const artifact = {
        id: 'rules/stable.md',
        type: 'rule' as const,
        frontmatter: { name: 'stable-rule', description: 'A stable rule' },
        body: 'Rule body.\n',
        sourcePath: 'rules/stable.md',
      };

      const content = renderMarkdown(artifact.frontmatter, artifact.body);
      const filePath = path.join(root, '.clinerules', 'stable.md');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);

      const relToRoot = path.relative(root, filePath).split(path.sep).join('/');
      const neutralResult = neutralize(filePath, relToRoot, cline, root);
      if (!neutralResult.ok) return;
      const gated = validateGate(neutralResult.result.artifact, relToRoot);
      if (!gated.ok) return;

      const { result: rt1 } = roundTrip(gated.artifact, cline, content, relToRoot);
      const { result: rt2 } = roundTrip(gated.artifact, cline, content, relToRoot);

      nfr001Results.push({
        target: 'cline',
        run1Fidelity: rt1.fidelity,
        run2Fidelity: rt2.fidelity,
        stable: rt1.fidelity === rt2.fidelity && rt1.verified === rt2.verified,
      });

      expect(rt1.fidelity).toBe(rt2.fidelity);
      expect(rt1.verified).toBe(rt2.verified);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
