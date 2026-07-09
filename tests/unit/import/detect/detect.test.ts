import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectFormat, resolveExplicitFormat } from '../../../../src/import/detect/detect';
import { ALL_DESCRIPTORS } from '../../../../src/registry/adapters';

function makeTempDir(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-test-'));
  return fs.realpathSync(base);
}

function writeFile(dir: string, relPath: string, content = '# test'): void {
  const abs = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

describe('detectFormat (T-003, FR-002, FR-005, FR-006, FR-048, FR-049, FR-050, FR-087)', () => {
  afterAll(() => {});

  it('returns single when exactly one descriptor matches (FR-002)', () => {
    const root = makeTempDir();
    try {
      writeFile(root, '.claude/commands/foo.md');
      const result = detectFormat(root, root, ALL_DESCRIPTORS);
      expect(result.outcome.kind).toBe('single');
      if (result.outcome.kind === 'single') {
        expect(result.outcome.targetId).toBe('claude-code');
        expect(result.outcome.method).toBe('auto-detected');
      }
      expect(result.warnings).toHaveLength(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns unrecognized for an empty/unknown directory (FR-005, FR-048, FR-049)', () => {
    const root = makeTempDir();
    try {
      writeFile(root, '.unknown-tool/foo.md');
      const result = detectFormat(root, root, ALL_DESCRIPTORS);
      expect(result.outcome.kind).toBe('unrecognized');
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.warnings[0].kind).toBe('unrecognized-format');
      expect(result.warnings[0].message).toContain('--format');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns ambiguous when 2 or more descriptors match (FR-006, FR-050, FR-087)', () => {
    const root = makeTempDir();
    try {
      writeFile(root, '.claude/commands/foo.md');
      writeFile(root, '.cursor/rules/bar.mdc');
      const result = detectFormat(root, root, ALL_DESCRIPTORS);
      expect(result.outcome.kind).toBe('ambiguous');
      if (result.outcome.kind === 'ambiguous') {
        expect(result.outcome.candidates).toContain('claude-code');
        expect(result.outcome.candidates).toContain('cursor');
        expect(result.outcome.candidates.length).toBeGreaterThanOrEqual(2);
      }
      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      const w = result.warnings[0];
      expect(w.kind).toBe('ambiguous-detection');
      expect(w.message).toContain('--format');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns single for a lone longtail rule directory', () => {
    const root = makeTempDir();
    try {
      writeFile(root, '.clinerules/my-rule.md');
      const result = detectFormat(root, root, ALL_DESCRIPTORS);
      expect(result.outcome.kind).toBe('single');
      if (result.outcome.kind === 'single') {
        expect(result.outcome.targetId).toBe('cline');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('resolveExplicitFormat (T-005, FR-003, FR-004, FR-046, FR-047)', () => {
  it('returns ok:true for a known format identifier (FR-003)', () => {
    const result = resolveExplicitFormat('claude-code', ALL_DESCRIPTORS);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.targetId).toBe('claude-code');
  });

  it('returns ok:false for an unknown format identifier (FR-004)', () => {
    const result = resolveExplicitFormat('not-a-real-target', ALL_DESCRIPTORS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not-a-real-target');
      // FR-046: must list accepted identifiers
      expect(result.error).toContain('claude-code');
    }
  });

  it('lists all accepted format identifiers in the error output (FR-046)', () => {
    const result = resolveExplicitFormat('nope', ALL_DESCRIPTORS);
    if (!result.ok) {
      for (const d of ALL_DESCRIPTORS) {
        expect(result.error).toContain(d.id);
      }
    }
  });
});
