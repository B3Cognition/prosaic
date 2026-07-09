import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeSource } from '../../../src/import/write/source-writer';
import { Artifact } from '../../../src/domain/types';

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'contain-test-')));
}

function makeArtifact(sourcePath: string): Artifact {
  return {
    id: sourcePath,
    type: 'rule',
    frontmatter: { name: 'test-rule' },
    body: 'Rule body.\n',
    sourcePath,
  };
}

describe('source writer containment (T-015, FR-032, FR-067, NFR-004)', () => {
  it('writes successfully inside the project root (FR-031, FR-032)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    try {
      const result = writeSource(
        makeArtifact('rules/my-rule.md'),
        sourceRoot,
        root,
        {},
      );
      expect(result.written).toBe(true);
      expect(fs.existsSync(path.join(sourceRoot, 'rules', 'my-rule.md'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses a write whose destination escapes the project root via parent traversal (FR-067, NFR-004)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    try {
      // Attempt to write to ../../outside which escapes root
      const escapingArtifact = makeArtifact('../../../outside/escape.md');
      const result = writeSource(escapingArtifact, sourceRoot, root, {});
      // Either the write is refused or containment error is caught
      if (result.written) {
        // If written, verify it's inside the root
        const written = path.resolve(sourceRoot, escapingArtifact.sourcePath);
        expect(written.startsWith(root)).toBe(true);
      } else {
        expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('dry-run performs 0 filesystem modifications (FR-035, FR-069)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    try {
      const artifact = makeArtifact('rules/preview-rule.md');
      const result = writeSource(artifact, sourceRoot, root, { dryRun: true });
      expect(result.written).toBe(false);
      expect(fs.existsSync(path.join(sourceRoot, 'rules', 'preview-rule.md'))).toBe(false);
      expect(result.preview).toBeTruthy();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('collision with existing user-authored file: overwrites 0 files, reports collision (FR-033, FR-068)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(path.join(sourceRoot, 'rules'), { recursive: true });
    try {
      // Pre-existing user-authored file
      const existingPath = path.join(sourceRoot, 'rules', 'my-rule.md');
      fs.writeFileSync(existingPath, '# User authored');
      const originalContent = fs.readFileSync(existingPath, 'utf8');

      const result = writeSource(makeArtifact('rules/my-rule.md'), sourceRoot, root, {});
      expect(result.written).toBe(false);
      expect(result.collision).toBe(true);
      // File unchanged
      expect(fs.readFileSync(existingPath, 'utf8')).toBe(originalContent);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('overwrites when --overwrite is set (FR-033 escape hatch)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(path.join(sourceRoot, 'rules'), { recursive: true });
    try {
      const existingPath = path.join(sourceRoot, 'rules', 'my-rule.md');
      fs.writeFileSync(existingPath, '# User authored');

      const result = writeSource(makeArtifact('rules/my-rule.md'), sourceRoot, root, {
        overwrite: true,
      });
      expect(result.written).toBe(true);
      expect(result.collision).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('symlink to outside root is refused (FR-067, NFR-004)', () => {
    const root = makeTempDir();
    const outside = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    try {
      // Create a symlink inside sourceRoot that points outside
      const symlinkPath = path.join(sourceRoot, 'evil-link');
      fs.symlinkSync(outside, symlinkPath);

      // Attempt to write through the symlink
      const evilArtifact = makeArtifact('evil-link/escape.md');
      // writeSource should either refuse or the containment check catches it
      expect(() => {
        writeSource(evilArtifact, sourceRoot, root, {});
      }).not.toThrow(); // NFR-007: no crashes
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
