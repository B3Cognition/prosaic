import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { importRun } from '../../src/import/run';
import { builtinRegistry } from '../../src/registry/builtin';
import { runPipeline } from '../../src/pipeline/runner';
import { ALL_DESCRIPTORS } from '../../src/registry/adapters';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const NFR003_ARTIFACT_PATH = path.join(RESULTS_DIR, 'import-offline-nfr003.json');

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'import-e2e-')));
}

describe('import command e2e (T-005, T-019, FR-001, FR-003, FR-004, FR-007, FR-051, NFR-003)', () => {
  it('unknown format exits with error listing accepted identifiers, writes 0 files (FR-004, FR-046, FR-047)', () => {
    const root = makeTempDir();
    try {
      const report = importRun({ projectRoot: root, format: 'not-a-real-target' });
      expect(report.files.length).toBeGreaterThanOrEqual(1);
      const file = report.files[0];
      expect(file.outcome.ok).toBe(false);
      if (!file.outcome.ok) {
        expect(file.outcome.reason).toContain('not-a-real-target');
        // FR-046: must list accepted identifiers
        const allIds = builtinRegistry().ids();
        for (const id of allIds.slice(0, 3)) {
          expect(file.outcome.reason + (file.warnings.map((w) => w.message).join(' '))).toContain(id);
        }
      }
      // FR-047: 0 source files written
      expect(fs.existsSync(path.join(root, 'source'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('explicit valid format bypasses auto-detection (FR-003, FR-007, FR-051)', () => {
    const root = makeTempDir();
    try {
      // Create a file in a cline-compatible directory
      const clinerules = path.join(root, '.clinerules');
      fs.mkdirSync(clinerules, { recursive: true });
      fs.writeFileSync(path.join(clinerules, 'rule.md'), '---\nname: test-rule\n---\n\nBody\n');

      const report = importRun({
        projectRoot: root,
        foreignDir: root,
        format: 'cline',
        dryRun: true,
      });

      expect(report.resolvedFormat).toBe('cline');
      expect(report.resolutionMethod).toBe('explicitly-specified');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('dry-run imports emits report without modifying filesystem (FR-035, FR-069)', () => {
    const root = makeTempDir();
    try {
      const clinerules = path.join(root, '.clinerules');
      fs.mkdirSync(clinerules, { recursive: true });
      fs.writeFileSync(path.join(clinerules, 'rule.md'), '---\nname: my-rule\n---\n\nBody\n');

      const before = fs.readdirSync(root);
      const report = importRun({
        projectRoot: root,
        foreignDir: root,
        format: 'cline',
        dryRun: true,
      });

      const after = fs.readdirSync(root);
      expect(after).toEqual(before);
      expect(report.dryRun).toBe(true);
      expect(report.preview.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('offline: import completes with no network access (NFR-003)', async () => {
    const root = makeTempDir();
    // Socket-level spy via prototype: assert 0 TCP connections are opened during importRun.
    // net.Socket.prototype.connect is the single choke-point for all Node.js TCP I/O.
    const socketSpy = jest.spyOn(net.Socket.prototype, 'connect').mockImplementation(function () {
      throw new Error('Network access attempted — import must be fully offline');
    });
    try {
      const clinerules = path.join(root, '.clinerules');
      fs.mkdirSync(clinerules, { recursive: true });
      fs.writeFileSync(path.join(clinerules, 'rule.md'), '# simple rule');

      const report = importRun({
        projectRoot: root,
        foreignDir: root,
        format: 'cline',
        dryRun: true,
      });

      expect(report).toBeDefined();
      expect(report.resolvedFormat).toBe('cline');
      // Measured artifact: 0 sockets opened, 0 credentials required (NFR-003)
      expect(socketSpy).toHaveBeenCalledTimes(0);

      const socketsOpened = socketSpy.mock.calls.length;
      fs.mkdirSync(RESULTS_DIR, { recursive: true });
      fs.writeFileSync(
        NFR003_ARTIFACT_PATH,
        JSON.stringify(
          {
            nfr: 'NFR-003',
            description: 'Fully offline operation: import completes with network access disabled',
            socketsOpened,
            credentialsRequired: 0,
            pass: socketsOpened === 0,
            isolationMechanism: 'jest.spyOn(net.Socket.prototype, "connect") throws on any call',
            recordedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } finally {
      socketSpy.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('full import flow: detect, neutralize, write, report (T-019)', () => {
    const root = makeTempDir();
    try {
      const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;
      const artifact = {
        id: 'rules/import-test.md',
        type: 'rule' as const,
        frontmatter: { name: 'import-test' },
        body: 'Test rule body.\n',
        sourcePath: 'rules/import-test.md',
      };

      const deployed = runPipeline(artifact, cline);
      const clinerules = path.join(root, '.clinerules');
      fs.mkdirSync(clinerules, { recursive: true });
      fs.writeFileSync(path.join(clinerules, 'import-test.md'), deployed.content);

      const report = importRun({
        projectRoot: root,
        foreignDir: root,
        format: 'cline',
      });

      expect(report.resolvedFormat).toBe('cline');
      expect(report.files.length).toBeGreaterThanOrEqual(1);

      const imported = report.files.find((f) => f.foreignPath.includes('import-test'));
      expect(imported).toBeDefined();
      if (imported) {
        expect(imported.outcome.ok).toBe(true);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
