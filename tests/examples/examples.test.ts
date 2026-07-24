import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadManifest } from './manifest-schema';
import { compareOutput, copyExampleToTempRoot, EXAMPLES_DIR, runManifestStep } from './run-example';
import { TempRoot } from '../helpers/temp-root';

function expectedOutputPathFor(exampleId: string, relativeFile: string): string {
  return path.join(EXAMPLES_DIR, exampleId, relativeFile);
}

function listExampleDirectories(baseDir: string): string[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function hasManifest(baseDir: string, directory: string): boolean {
  return fs.existsSync(path.join(baseDir, directory, 'example.manifest.json'));
}

describe('Example Verification Check: coverage gap (T-005, FR-017)', () => {
  it('every enumerated examples/* directory has a manifest, or is reported as a coverage gap', () => {
    const directories = listExampleDirectories(EXAMPLES_DIR);
    for (const directory of directories) {
      expect(hasManifest(EXAMPLES_DIR, directory)).toBe(true);
    }
  });
});

describe('Example Verification Check: harness self-tests (T-029, FR-016/FR-017)', () => {
  it('harness self-test: a directory missing a manifest reports a coverage gap, never a pass', () => {
    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'prosaic-examples-selftest-'));
    try {
      fs.mkdirSync(path.join(tempBase, 'no-manifest-fixture'));
      const directories = listExampleDirectories(tempBase);
      expect(directories).toEqual(['no-manifest-fixture']);
      const gaps = directories.filter((directory) => !hasManifest(tempBase, directory));
      expect(gaps).toEqual(['no-manifest-fixture']);
    } finally {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  it('harness self-test: one mutated byte in captured live output produces exactly one named divergence-failure, never a silent pass', () => {
    const exampleId = '01-basic-write-preview-revert';
    const manifest = loadManifest(path.join(EXAMPLES_DIR, exampleId, 'example.manifest.json'), {
      requireNonHappyPath: true,
    });
    const [previewStep] = manifest.steps;
    const tempRoot = copyExampleToTempRoot(exampleId);
    try {
      const result = runManifestStep(tempRoot, previewStep.args);
      expect(result.stdout.length).toBeGreaterThan(0);
      const mutatedLastChar = result.stdout.at(-1) === 'x' ? 'y' : 'x';
      const mutatedLiveOutput = result.stdout.slice(0, -1) + mutatedLastChar;
      const comparison = compareOutput(
        mutatedLiveOutput,
        expectedOutputPathFor(exampleId, previewStep.expectedOutputFile),
      );
      expect(comparison.pass).toBe(false);
      expect(comparison.byteDiffCount).toBe(1);
    } finally {
      tempRoot.cleanup();
    }
  });
});

describe('01-basic-write-preview-revert (T-010)', () => {
  const exampleId = '01-basic-write-preview-revert';
  const manifest = loadManifest(path.join(EXAMPLES_DIR, exampleId, 'example.manifest.json'), {
    requireNonHappyPath: true,
  });
  const [previewStep, applyStep, reapplyStep, revertStep] = manifest.steps;

  // Steps 0-2 build on each other (preview, write, unchanged re-apply) and
  // share one temp root, mirroring a realistic session. Step 3 (revert)
  // requires zero prior writes (AC-003), so it runs against its own fresh
  // temp root rather than continuing the session above.
  let sessionRoot: TempRoot;

  beforeAll(() => {
    sessionRoot = copyExampleToTempRoot(exampleId);
  });

  afterAll(() => {
    sessionRoot.cleanup();
  });

  it('AC-001: dry-run preview matches the expected-output record with 0 byte differences', () => {
    const result = runManifestStep(sessionRoot, previewStep.args);
    expect(result.exitCode).toBe(previewStep.expectedExitCode);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, previewStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
    expect(comparison.byteDiffCount).toBe(0);
  });

  it('writes the generated files (setup for AC-002)', () => {
    const result = runManifestStep(sessionRoot, applyStep.args);
    expect(result.exitCode).toBe(applyStep.expectedExitCode);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, applyStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
  });

  it('AC-002: an unchanged re-apply reports exactly 0 changed files', () => {
    const result = runManifestStep(sessionRoot, reapplyStep.args);
    expect(result.exitCode).toBe(reapplyStep.expectedExitCode);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, reapplyStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
    expect(comparison.byteDiffCount).toBe(0);
    expect(result.stdout).toContain('0 changed file(s)');
  });

  it('AC-003: reverting with zero prior writes returns exactly one error and a non-zero exit code', () => {
    const freshRoot = copyExampleToTempRoot(exampleId);
    try {
      const result = runManifestStep(freshRoot, revertStep.args);
      expect(result.exitCode).toBe(revertStep.expectedExitCode);
      expect(result.exitCode).not.toBe(0);
      const comparison = compareOutput(
        result.stdout,
        expectedOutputPathFor(exampleId, revertStep.expectedOutputFile),
      );
      expect(comparison.pass).toBe(true);
      expect(result.stdout.trim().split('\n')).toHaveLength(1);
    } finally {
      freshRoot.cleanup();
    }
  });
});

describe('02-multi-artifact-type (T-013)', () => {
  const exampleId = '02-multi-artifact-type';
  const manifest = loadManifest(path.join(EXAMPLES_DIR, exampleId, 'example.manifest.json'), {
    requireNonHappyPath: false,
  });
  const [claudeCodeStep, cursorStep] = manifest.steps;

  let sessionRoot: TempRoot;

  beforeAll(() => {
    sessionRoot = copyExampleToTempRoot(exampleId);
  });

  afterAll(() => {
    sessionRoot.cleanup();
  });

  it('AC-004: applying to claude-code produces output for all 4 artifact categories', () => {
    const result = runManifestStep(sessionRoot, claudeCodeStep.args);
    expect(result.exitCode).toBe(claudeCodeStep.expectedExitCode);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, claudeCodeStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
    expect(comparison.byteDiffCount).toBe(0);
    for (const destination of ['commands/changelog.md', 'api-conventions.md', 'skills/onboarding.md', 'agents/reviewer.md']) {
      expect(result.stdout).toContain(destination);
    }
  });

  it('AC-005: applying to cursor surfaces one capability-gating warning per unsupported category, never a silent drop', () => {
    const result = runManifestStep(sessionRoot, cursorStep.args);
    expect(result.exitCode).toBe(cursorStep.expectedExitCode);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, cursorStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
    expect(comparison.byteDiffCount).toBe(0);
    const warningLines = result.stdout
      .split('\n')
      .filter((line) => line.startsWith('warning[unsupported-pair]'));
    expect(warningLines).toHaveLength(2);
    expect(result.stdout).toContain('artifact type "skill"; skipped');
    expect(result.stdout).toContain('artifact type "subagent"; skipped');
  });
});
