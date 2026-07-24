import * as fs from 'fs';
import * as path from 'path';
import { loadManifest } from './manifest-schema';
import { compareOutput, copyExampleToTempRoot, EXAMPLES_DIR, runManifestStep } from './run-example';
import { TempRoot } from '../helpers/temp-root';

function expectedOutputPathFor(exampleId: string, relativeFile: string): string {
  return path.join(EXAMPLES_DIR, exampleId, relativeFile);
}

function listExampleDirectories(): string[] {
  if (!fs.existsSync(EXAMPLES_DIR)) {
    return [];
  }
  return fs
    .readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function hasManifest(directory: string): boolean {
  return fs.existsSync(path.join(EXAMPLES_DIR, directory, 'example.manifest.json'));
}

describe('Example Verification Check: coverage gap (T-005, FR-017)', () => {
  it('every enumerated examples/* directory has a manifest, or is reported as a coverage gap', () => {
    const directories = listExampleDirectories();
    for (const directory of directories) {
      expect(hasManifest(directory)).toBe(true);
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
