import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveScope } from '../../../src/import/detect/scope';
import { ALL_DESCRIPTORS } from '../../../src/registry/adapters';

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-')));
}

function writeFile(root: string, rel: string, content = '# test'): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

describe('resolveScope (T-004, FR-043, FR-078, FR-085)', () => {
  it('attributes each file to exactly 1 target in a single-tool directory (FR-078)', () => {
    const root = makeTempDir();
    try {
      writeFile(root, '.claude/commands/cmd1.md');
      writeFile(root, '.claude/commands/cmd2.md');
      writeFile(root, '.claude/agents/agent1.md');

      const { attributed, unattributed } = resolveScope(
        [path.join(root, '.claude')],
        root,
        ALL_DESCRIPTORS,
        'claude-code',
      );

      expect(attributed.length).toBe(3);
      expect(unattributed.length).toBe(0);
      for (const f of attributed) {
        expect(f.targetId).toBe('claude-code');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('attributes 0 files to a target outside the run scope (FR-085)', () => {
    const root = makeTempDir();
    try {
      writeFile(root, '.claude/commands/cmd.md');
      writeFile(root, '.cursor/rules/rule.mdc');

      // Scope limited to .claude only
      const { attributed, unattributed } = resolveScope(
        [path.join(root, '.claude')],
        root,
        ALL_DESCRIPTORS,
        'claude-code',
      );

      const claudeFiles = attributed.filter((f) => f.targetId === 'claude-code');
      const cursorFiles = attributed.filter((f) => f.targetId === 'cursor');
      expect(claudeFiles.length).toBe(1);
      expect(cursorFiles.length).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('per-file attribution in multi-directory scope resolves to exactly 1 target per file (FR-078)', () => {
    const root = makeTempDir();
    try {
      writeFile(root, '.claude/commands/cmd.md');
      writeFile(root, '.clinerules/rule.md');

      const { attributed } = resolveScope(
        [root],
        root,
        ALL_DESCRIPTORS,
        // no explicit targetId: per-file attribution
      );

      // Each file should have exactly 1 attribution
      const byPath = new Map<string, string[]>();
      for (const f of attributed) {
        const existing = byPath.get(f.relToRoot) ?? [];
        existing.push(f.targetId);
        byPath.set(f.relToRoot, existing);
      }
      for (const [, targets] of byPath) {
        expect(targets).toHaveLength(1);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('scope accepts project-root (FR-043)', () => {
    const root = makeTempDir();
    try {
      writeFile(root, '.clinerules/rule1.md');
      writeFile(root, '.clinerules/rule2.md');

      const { attributed } = resolveScope([root], root, ALL_DESCRIPTORS, 'cline');
      expect(attributed.length).toBe(2);
      for (const f of attributed) {
        expect(f.targetId).toBe('cline');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
