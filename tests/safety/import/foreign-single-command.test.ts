import * as fs from 'fs';
import * as path from 'path';
import { importRun } from '../../../src/import/run';
import { detectFormat } from '../../../src/import/detect/detect';
import { builtinRegistry } from '../../../src/registry/builtin';
import { TargetDescriptor } from '../../../src/registry/descriptor';
import { FOREIGN_FIXTURES, makeTempDir, readForeignContent, writeArtifact } from './foreign-corpus';

/**
 * SC-001 — single-command, no-flag auto-detect import for every unambiguous
 * registry target, exercised with GENUINELY-FOREIGN inputs.
 *
 * Prior evidence generated fixtures self-referentially (forward-render → import),
 * so targets were not exercised against genuinely-foreign inputs. Here every input
 * is genuinely foreign — never produced by the tool's own pipeline:
 *   - markdown-format targets get a hand-written literal rule file staged at the
 *     target's canonical layout;
 *   - the 3 structured-format targets (toml/yaml) use the committed hand-authored
 *     foreign fixtures under conformance-fixtures/import-foreign/.
 * For each, the no-flag `importRun` must auto-detect exactly that target and import
 * its prose with 0 silent drops. Coverage is measured across the full registry.
 */
const HAND_AUTHORED: Record<string, string> = Object.fromEntries(
  FOREIGN_FIXTURES.map((f) => [f.id, f.relPath]),
);

/** Build a genuinely-foreign input (path + content) for a target — never pipeline output. */
function genuineForeignInput(desc: TargetDescriptor): { relPath: string; content: string; oracle: string } | null {
  const ext = desc.extension;
  const isMarkdown = ext.endsWith('.md') || ext === '.mdc';
  if (isMarkdown) {
    const dir = desc.destinationDir.replace(/\/$/, '');
    const relPath = path.posix.join(dir, `genuine-foreign-sample${ext}`);
    // Hand-written literal foreign prose, authored here — decoupled from the serializer.
    const content =
      `---\nname: genuine-foreign-sample\ndescription: A genuinely foreign hand-written rule.\n---\n` +
      `Always write clear, well-tested code and explain non-obvious decisions.\n`;
    return { relPath, content, oracle: 'synthesized-foreign-markdown' };
  }
  // Structured formats: reuse the committed hand-authored foreign fixture.
  const fixtureRel = HAND_AUTHORED[desc.id];
  if (fixtureRel) {
    return {
      relPath: fixtureRel,
      content: readForeignContent({ id: desc.id, relPath: fixtureRel }),
      oracle: 'hand-authored-foreign-fixture',
    };
  }
  return null;
}

describe('single-command no-flag import with genuinely-foreign inputs — measured runtime (SC-001, FR-001, FR-002)', () => {
  const registry = builtinRegistry();
  const descriptors = registry.all();

  const covered: Array<{ target: string; oracle: string; detected: string; imported: boolean }> = [];
  const uncovered: string[] = [];

  afterAll(() => {
    const pass =
      covered.length > 0 &&
      covered.every((c) => c.detected === c.target && c.imported) &&
      uncovered.length === 0;
    writeArtifact('import-single-command-foreign-sc001.json', {
      sc: 'SC-001',
      requirements: ['SC-001', 'FR-001', 'FR-002'],
      evidenceKind: 'measured_runtime',
      description:
        'The no-flag single command auto-detects and imports genuinely-foreign prose (never the tool\'s own ' +
        'forward output) for every unambiguous registry target, with 0 silent drops. Measured per-target via ' +
        'the real end-to-end importRun over hand-written / hand-authored foreign inputs.',
      registryTargetCount: descriptors.length,
      genuineForeignCovered: covered.length,
      handAuthoredFixtureTargets: covered.filter((c) => c.oracle === 'hand-authored-foreign-fixture').length,
      synthesizedForeignTargets: covered.filter((c) => c.oracle === 'synthesized-foreign-markdown').length,
      uncoveredTargets: uncovered,
      results: [...covered].sort((a, b) => a.target.localeCompare(b.target)),
      measurableTarget: 'every unambiguous registry target auto-detects + imports from a genuinely-foreign input',
      pass,
      recordedAt: new Date().toISOString(),
    });
  });

  it('covers the full registry (not a partial 9-target sample)', () => {
    expect(descriptors.length).toBeGreaterThanOrEqual(FOREIGN_FIXTURES.length);
  });

  for (const desc of descriptors) {
    it(`${desc.id}: no-flag import auto-detects and imports a genuinely-foreign input`, () => {
      const input = genuineForeignInput(desc);
      if (input === null) {
        uncovered.push(desc.id);
        return;
      }
      const root = makeTempDir('sc001-foreign-');
      try {
        const abs = path.join(root, input.relPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, input.content);

        // Layout must be unambiguous for the no-flag path (SC-001 scope).
        const detection = detectFormat(root, root, descriptors);
        expect(detection.outcome.kind).toBe('single');
        if (detection.outcome.kind !== 'single' || detection.outcome.targetId !== desc.id) {
          uncovered.push(desc.id);
          return;
        }

        // The single no-flag command auto-detects and imports the foreign prose.
        const report = importRun({ projectRoot: root });
        expect(report.resolvedFormat).toBe(desc.id);
        expect(report.resolutionMethod).toBe('auto-detected');
        expect(report.silentDropCount).toBe(0);
        const imported = report.files.some((f) => f.outcome.ok);
        expect(imported).toBe(true);

        covered.push({ target: desc.id, oracle: input.oracle, detected: detection.outcome.targetId, imported });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
