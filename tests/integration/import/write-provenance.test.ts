import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { neutralize } from '../../../src/import/neutralize/neutralize';
import { validateGate } from '../../../src/import/neutralize/validate-gate';
import { writeSource } from '../../../src/import/write/source-writer';
import { ALL_DESCRIPTORS } from '../../../src/registry/adapters';
import { runPipeline } from '../../../src/pipeline/runner';

const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'provenance-test-')));
}

describe('write provenance and validation gate (T-013, T-015, FR-030, FR-066)', () => {
  it('validates artifact before write; drops with warning on failure (FR-030, FR-066)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    try {
      // Subagent requires name + description — supply neither to force validation failure
      const filePath = path.join(root, '.clinerules', 'rule.md');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      // This file will neutralize as a "rule" type which has no required fields
      // So we need a different approach: manually create an artifact that fails validation
      fs.writeFileSync(filePath, '---\nname: valid-rule\n---\n\nBody\n');

      const relToRoot = path.relative(root, filePath).split(path.sep).join('/');
      const neutralResult = neutralize(filePath, relToRoot, cline, root);
      expect(neutralResult.ok).toBe(true);
      if (!neutralResult.ok) return;

      // Force type to subagent to trigger validation failure (missing required description)
      const brokenArtifact = {
        ...neutralResult.result.artifact,
        type: 'subagent' as const,
        // Missing description: will fail subagent schema
      };
      delete (brokenArtifact.frontmatter as any).description;

      const gated = validateGate(brokenArtifact, relToRoot);
      expect(gated.ok).toBe(false);
      if (!gated.ok) {
        expect(gated.warnings.length).toBeGreaterThanOrEqual(1);
        expect(gated.warnings[0].kind).toBe('schema-invalid');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('preview mode lists all changes with 0 writes (FR-035, FR-069)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    try {
      const artifact = {
        id: 'rules/preview-rule.md',
        type: 'rule' as const,
        frontmatter: { name: 'preview-rule' },
        body: 'Body\n',
        sourcePath: 'rules/preview-rule.md',
      };

      const result = writeSource(artifact, sourceRoot, root, { dryRun: true });
      expect(result.written).toBe(false);
      expect(result.preview).toBeTruthy();
      expect(result.preview).toContain('preview-rule');
      expect(fs.existsSync(path.join(sourceRoot, 'rules', 'preview-rule.md'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('imports a deployed artifact and writes valid source (FR-031)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    try {
      const artifact = {
        id: 'rules/test-rule.md',
        type: 'rule' as const,
        frontmatter: { name: 'test-rule', description: 'A test rule' },
        body: 'Rule body content.\n',
        sourcePath: 'rules/test-rule.md',
      };

      const deployed = runPipeline(artifact, cline);
      const filePath = path.join(root, deployed.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, deployed.content);

      const relToRoot = deployed.path;
      const neutralResult = neutralize(filePath, relToRoot, cline, root);
      expect(neutralResult.ok).toBe(true);
      if (!neutralResult.ok) return;

      const gated = validateGate(neutralResult.result.artifact, relToRoot);
      expect(gated.ok).toBe(true);
      if (!gated.ok) return;

      const writeResult = writeSource(gated.artifact, sourceRoot, root, {});
      expect(writeResult.written).toBe(true);
      expect(fs.existsSync(path.join(sourceRoot, gated.artifact.sourcePath))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
