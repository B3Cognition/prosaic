import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { neutralize } from '../../src/import/neutralize/neutralize';
import { validateGate } from '../../src/import/neutralize/validate-gate';
import { roundTrip } from '../../src/import/verify/round-trip';
import { IMPORT_STABLE_TARGETS } from '../../src/import/detect/parity';
import { ALL_DESCRIPTORS } from '../../src/registry/adapters';

/**
 * SC-003 genuine-foreign oracle: round-trip against hand-authored/captured
 * foreign files committed under conformance-fixtures/import-foreign/, NOT the
 * tool's own runtime forward output. Each fixture is a static on-disk artifact
 * in the foreign tool's canonical form; re-deploying the neutralized artifact
 * MUST reproduce that original foreign file byte-for-byte (SC-003, FR-036,
 * FR-037). Because the oracle is a committed file decoupled from the live
 * serializer, this catches serializer drift the self-referential conformance
 * oracle cannot.
 */
const FIXTURE_ROOT = path.join(process.cwd(), 'conformance-fixtures', 'import-foreign');
const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const SC003_FOREIGN_PATH = path.join(RESULTS_DIR, 'import-roundtrip-foreign-sc003.json');

// One genuinely-foreign fixture per fully-invertible import-stable target,
// keyed by target id and its canonical on-disk relative path.
const FOREIGN_FIXTURES: Array<{ id: string; relPath: string }> = [
  { id: 'claude-code', relPath: '.claude/team-guardrails.md' },
  { id: 'cursor', relPath: '.cursor/rules/review-checklist.mdc' },
  { id: 'windsurf', relPath: '.windsurf/rules/style-rules.md' },
  { id: 'cline', relPath: '.clinerules/safety-rules.md' },
  { id: 'roo-code', relPath: '.roo/rules/commit-rules.md' },
  { id: 'codex-cli', relPath: '.codex/prompts/summarize.toml' },
  { id: 'gemini-cli', relPath: '.gemini/commands/explain.toml' },
  { id: 'goose', relPath: '.goose/recipes/refactor.yaml' },
  { id: 'github-copilot', relPath: '.github/instructions/test-guidance.instructions.md' },
];

const foreignResults: Array<{ target: string; fidelity: string; byteIdentical: boolean; pass: boolean }> = [];

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'import-foreign-')));
}

describe('SC-003 genuine-foreign round-trip oracle (hand-authored fixtures)', () => {
  afterAll(() => {
    const failCount = foreignResults.filter((r) => !r.pass).length;
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      SC003_FOREIGN_PATH,
      JSON.stringify(
        {
          sc: 'SC-003',
          description:
            'Byte-for-byte round-trip against hand-authored/captured foreign files (not the tool\'s own forward output)',
          oracle: 'hand-authored-foreign-file',
          fixtureRoot: 'conformance-fixtures/import-foreign',
          totalSamples: foreignResults.length,
          fullyInvertible: foreignResults.filter((r) => r.fidelity === 'fully-invertible').length,
          byteIdentical: foreignResults.filter((r) => r.byteIdentical).length,
          failCount,
          pass: failCount === 0 && foreignResults.length >= IMPORT_STABLE_TARGETS.size,
          results: foreignResults,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  it('covers one foreign fixture per import-stable target', () => {
    const covered = new Set(FOREIGN_FIXTURES.map((f) => f.id));
    for (const id of IMPORT_STABLE_TARGETS) {
      expect(covered.has(id)).toBe(true);
    }
    expect(FOREIGN_FIXTURES.length).toBe(IMPORT_STABLE_TARGETS.size);
  });

  for (const fixture of FOREIGN_FIXTURES) {
    it(`${fixture.id}: re-deploy reproduces the original foreign file byte-for-byte (SC-003)`, () => {
      const desc = ALL_DESCRIPTORS.find((d) => d.id === fixture.id)!;
      expect(desc).toBeDefined();

      // The original foreign file is a committed static artifact, read from disk —
      // never produced by runPipeline in this test.
      const fixtureAbs = path.join(FIXTURE_ROOT, fixture.id, fixture.relPath);
      const originalContent = fs.readFileSync(fixtureAbs, 'utf8');

      const root = makeTempDir();
      try {
        const fileAbs = path.join(root, fixture.relPath);
        fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
        fs.writeFileSync(fileAbs, originalContent);

        const neutralResult = neutralize(fileAbs, fixture.relPath, desc, root);
        expect(neutralResult.ok).toBe(true);
        if (!neutralResult.ok) return;

        const gated = validateGate(neutralResult.result.artifact, fixture.relPath);
        expect(gated.ok).toBe(true);
        if (!gated.ok) return;

        const { result: rtResult } = roundTrip(gated.artifact, desc, originalContent, fixture.relPath);

        const byteIdentical = rtResult.verified && rtResult.fidelity === 'fully-invertible';
        foreignResults.push({
          target: fixture.id,
          fidelity: rtResult.fidelity,
          byteIdentical,
          pass: byteIdentical,
        });

        // SC-003: byte-for-byte reproduction of the genuinely-foreign original.
        expect(rtResult.verified).toBe(true);
        expect(rtResult.fidelity).toBe('fully-invertible');
        expect(rtResult.diffRegions).toHaveLength(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
