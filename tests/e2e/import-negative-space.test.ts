import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { importRun } from '../../src/import/run';
import { runPipeline } from '../../src/pipeline/runner';
import { ALL_DESCRIPTORS } from '../../src/registry/adapters';
import { GuardedFs } from '../../src/write/guarded-fs';
import { Manifest, MANIFEST_FILENAME } from '../../src/manifest/manifest';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'import-negspace-')));
}

/** Hash every file under `dir`, keyed by path relative to `dir`. */
function snapshotTree(dir: string): Map<string, string> {
  const snap = new Map<string, string>();
  function recurse(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) recurse(abs);
      else if (entry.isFile()) {
        const rel = path.relative(dir, abs).split(path.sep).join('/');
        const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
        snap.set(rel, hash);
      }
    }
  }
  if (fs.existsSync(dir)) recurse(dir);
  return snap;
}

function snapObj(m: Map<string, string>): Record<string, string> {
  return Object.fromEntries([...m.entries()].sort());
}

const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;
const crush = ALL_DESCRIPTORS.find((d) => d.id === 'crush')!;

describe('import negative-space obligations (FR-034, FR-082, AC-007)', () => {
  it('changes exactly 0 files in the foreign source directory during import (FR-034)', () => {
    const root = makeTempDir();
    const foreignDir = path.join(root, 'foreign');
    try {
      // Deploy a cline rule into the foreign directory.
      const artifact = {
        id: 'rules/keep-me.md',
        type: 'rule' as const,
        frontmatter: { name: 'keep-me', description: 'do not touch' },
        body: 'Foreign rule body.\n',
        sourcePath: 'rules/keep-me.md',
      };
      const deployed = runPipeline(artifact, cline);
      const foreignFile = path.join(foreignDir, deployed.path);
      fs.mkdirSync(path.dirname(foreignFile), { recursive: true });
      fs.writeFileSync(foreignFile, deployed.content);

      const before = snapshotTree(foreignDir);
      expect(before.size).toBeGreaterThanOrEqual(1);

      // Real (non-dry-run) import — writes prosaic source under root/source, sibling
      // to the foreign directory, so the foreign layout must be untouched.
      const report = importRun({ projectRoot: root, foreignDir, format: 'cline' });
      expect(report.files.length).toBeGreaterThanOrEqual(1);

      const after = snapshotTree(foreignDir);
      // FR-034: 0 files changed, added, or removed in the foreign directory.
      expect(snapObj(after)).toEqual(snapObj(before));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('records 0 imported artifacts in the managed-outputs manifest (FR-082)', () => {
    const root = makeTempDir();
    const foreignDir = path.join(root, 'foreign');
    try {
      // Pre-seed a manifest with an unrelated managed entry.
      const gfs = new GuardedFs(root);
      const manifest = Manifest.empty(gfs, '1.0.0');
      manifest.record('claude-code', '.claude/commands/pre-existing.md', 'deadbeef');
      manifest.save();
      const manifestPath = path.join(root, MANIFEST_FILENAME);
      const beforeBytes = fs.readFileSync(manifestPath, 'utf8');

      // Deploy a cline rule and import it for real.
      const artifact = {
        id: 'rules/imported.md',
        type: 'rule' as const,
        frontmatter: { name: 'imported', description: 'via import' },
        body: 'Imported rule body.\n',
        sourcePath: 'rules/imported.md',
      };
      const deployed = runPipeline(artifact, cline);
      const foreignFile = path.join(foreignDir, deployed.path);
      fs.mkdirSync(path.dirname(foreignFile), { recursive: true });
      fs.writeFileSync(foreignFile, deployed.content);

      const report = importRun({ projectRoot: root, foreignDir, format: 'cline' });
      expect(report.files.some((f) => f.outcome.ok)).toBe(true);

      // FR-082: the manifest is byte-identical — import added 0 new/changed entries.
      const afterBytes = fs.readFileSync(manifestPath, 'utf8');
      expect(afterBytes).toBe(beforeBytes);

      const reloaded = Manifest.load(gfs);
      expect(reloaded.all()).toHaveLength(1);
      expect(reloaded.isManaged('claude-code', '.claude/commands/pre-existing.md')).toBe(true);
      // No imported source path was recorded under any target.
      expect(reloaded.isManagedPath('source/rules/imported.md')).toBe(false);
      expect(reloaded.isManagedPath('rules/imported.md')).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('records that an explicit --format resolved an ambiguous layout (AC-007)', () => {
    const root = makeTempDir();
    try {
      // Seed a genuinely ambiguous layout at the project root (signature dirs are
      // project-root-relative): cline (.clinerules) AND crush (.crush/rules).
      const clineFile = path.join(root, '.clinerules', 'a.md');
      const crushFile = path.join(root, '.crush', 'rules', 'b.md');
      fs.mkdirSync(path.dirname(clineFile), { recursive: true });
      fs.mkdirSync(path.dirname(crushFile), { recursive: true });
      fs.writeFileSync(clineFile, '---\nname: a\ndescription: rule a\n---\nBody A\n');
      fs.writeFileSync(crushFile, '---\nname: b\ndescription: rule b\n---\nBody B\n');

      // Sanity: crush is a real registry target so the layout is truly 2-candidate.
      expect(crush).toBeDefined();

      const report = importRun({
        projectRoot: root,
        foreignDir: root,
        format: 'cline',
        dryRun: true,
      });

      // Import proceeds using the supplied format...
      expect(report.resolvedFormat).toBe('cline');
      expect(report.resolutionMethod).toBe('explicitly-specified');

      // ...AND records that ambiguity was resolved by explicit override (AC-007).
      expect(report.ambiguityResolvedByOverride).toBeDefined();
      const candidates = report.ambiguityResolvedByOverride!.candidates;
      expect(candidates.length).toBeGreaterThanOrEqual(2);
      expect(candidates).toContain('cline');
      expect(candidates).toContain('crush');

      // The override is also surfaced as a warning naming the overridden candidates.
      const overrideWarning = report.allWarnings.find(
        (w) => w.kind === 'ambiguous-detection' && w.message.includes('resolved by explicit'),
      );
      expect(overrideWarning).toBeDefined();
      expect(overrideWarning!.message).toContain('crush');

      fs.mkdirSync(RESULTS_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(RESULTS_DIR, 'import-ambiguity-override-ac007.json'),
        JSON.stringify(
          {
            ac: 'AC-007',
            description:
              'Explicit --format over an ambiguous foreign layout: import proceeds and records the override',
            suppliedFormat: 'cline',
            overriddenCandidates: candidates,
            overrideRecorded: true,
            pass: candidates.length >= 2 && candidates.includes('cline'),
            recordedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
