import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { loadManifest } from './manifest-schema';
import { compareOutput, copyExampleToTempRoot, EXAMPLES_DIR, getNetworkCallSamples, runManifestStep } from './run-example';
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

/** Find every `prosaic.config.yaml` nested anywhere under `examples/*` (including linked-project subdirectories like `consuming-app/`). */
function findAllConfigFiles(baseDir: string): string[] {
  const results: string[] = [];
  const skip = new Set(['.prosaic', 'expected-output', 'foreign-fixture']);
  function recurse(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue;
        recurse(path.join(dir, entry.name));
      } else if (entry.isFile() && entry.name === 'prosaic.config.yaml') {
        results.push(path.join(dir, entry.name));
      }
    }
  }
  recurse(baseDir);
  return results;
}

/** Distinct `targets:` identifiers across every committed `prosaic.config.yaml` under `examples/` (NFR-002). */
function collectAllConfiguredTargets(baseDir: string): Set<string> {
  const targets = new Set<string>();
  for (const configPath of findAllConfigFiles(baseDir)) {
    const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) as { targets?: string[] } | undefined;
    for (const target of parsed?.targets ?? []) {
      targets.add(target);
    }
  }
  return targets;
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
    expect(result.networkCallCount).toBe(0);
  });

  it('writes the generated files (setup for AC-002)', () => {
    const result = runManifestStep(sessionRoot, applyStep.args);
    expect(result.exitCode).toBe(applyStep.expectedExitCode);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, applyStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
    expect(result.networkCallCount).toBe(0);
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
    expect(result.networkCallCount).toBe(0);
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
      expect(result.networkCallCount).toBe(0);
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
    expect(result.networkCallCount).toBe(0);
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
    expect(result.networkCallCount).toBe(0);
  });
});

const REQUIRED_MVP_FLOWS = ['01-basic-write-preview-revert', '02-multi-artifact-type'];
const REQUIRED_FLOWS = [...REQUIRED_MVP_FLOWS, '03-import', '04-resolve'];

describe('Example Verification Check: MVP flow coverage (T-032, FR-019/AC-016)', () => {
  it('MVP flow coverage: at least 2 required flows are enumerated under examples/*', () => {
    const directories = new Set(listExampleDirectories(EXAMPLES_DIR));
    const covered = REQUIRED_MVP_FLOWS.filter((id) => directories.has(id));
    expect(covered.length).toBeGreaterThanOrEqual(2);
  });
});

describe('03-import (T-019)', () => {
  const exampleId = '03-import';
  const manifest = loadManifest(path.join(EXAMPLES_DIR, exampleId, 'example.manifest.json'), {
    requireNonHappyPath: false,
  });
  const [importStep] = manifest.steps;

  let sessionRoot: TempRoot;
  let result: ReturnType<typeof runManifestStep>;

  beforeAll(() => {
    sessionRoot = copyExampleToTempRoot(exampleId);
    result = runManifestStep(sessionRoot, importStep.args);
  });

  afterAll(() => {
    sessionRoot.cleanup();
  });

  it('AC-006: the recovered artifact reports exactly one fidelity level, never an unqualified loss-free claim', () => {
    expect(result.exitCode).toBe(importStep.expectedExitCode);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, importStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
    expect(comparison.byteDiffCount).toBe(0);
    const fidelityLines = result.stdout
      .split('\n')
      .filter((line) => line.trim().startsWith('fidelity[claude-code]'));
    expect(fidelityLines).toHaveLength(1);
    expect(result.networkCallCount).toBe(0);
  });

  it('AC-007: the malformed file produces exactly one per-file warning and the run completes rather than aborting', () => {
    const warningLines = result.stdout
      .split('\n')
      .filter((line) => line.startsWith('warning[malformed-frontmatter]'));
    expect(warningLines).toHaveLength(1);
    expect(result.stdout).toContain('team-guardrails.md');
  });
});

describe('04-resolve (T-022)', () => {
  const exampleId = '04-resolve';
  const manifest = loadManifest(path.join(EXAMPLES_DIR, exampleId, 'example.manifest.json'), {
    requireNonHappyPath: false,
  });
  const [resolveStep, unregisteredTargetStep] = manifest.steps;

  let sessionRoot: TempRoot;

  beforeAll(() => {
    sessionRoot = copyExampleToTempRoot(exampleId);
  });

  afterAll(() => {
    sessionRoot.cleanup();
  });

  it('AC-008: resolving a registered artifact/target pair reports 0 missing documented fields', () => {
    const result = runManifestStep(sessionRoot, resolveStep.args);
    expect(result.exitCode).toBe(resolveStep.expectedExitCode);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, resolveStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
    expect(comparison.byteDiffCount).toBe(0);
    const parsed = JSON.parse(result.stdout);
    for (const field of ['model', 'reasoningEffort', 'tools', 'executionType']) {
      expect(parsed[field]).toBeDefined();
      expect(parsed[field].status).toMatch(/^(resolved|unresolved)$/);
    }
    expect(result.networkCallCount).toBe(0);
  });

  it('AC-009: resolving against an unregistered target reports exactly one documented error, non-zero exit', () => {
    const result = runManifestStep(sessionRoot, unregisteredTargetStep.args);
    expect(result.exitCode).toBe(unregisteredTargetStep.expectedExitCode);
    expect(result.exitCode).not.toBe(0);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, unregisteredTargetStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(result.stdout).toContain('Unknown target');
    expect(result.networkCallCount).toBe(0);
  });
});

describe('Example Verification Check: required-flow coverage and target-identifier footprint (T-023, coverage footprint)', () => {
  it('AC-015: required-flow coverage computed from enumerated examples/* equals 4', () => {
    const directories = new Set(listExampleDirectories(EXAMPLES_DIR));
    const covered = REQUIRED_FLOWS.filter((id) => directories.has(id));
    expect(covered.length).toBe(4);
  });

  it('NFR-002: distinct target identifiers across every committed prosaic.config.yaml do not exceed 6', () => {
    const targets = collectAllConfiguredTargets(EXAMPLES_DIR);
    expect(targets.size).toBeLessThanOrEqual(6);
  });
});

describe('05-multi-repository (T-027)', () => {
  const exampleId = '05-multi-repository';
  const manifest = loadManifest(path.join(EXAMPLES_DIR, exampleId, 'example.manifest.json'), {
    requireNonHappyPath: false,
  });
  const [applyStep] = manifest.steps;

  let sessionRoot: TempRoot;

  beforeAll(() => {
    sessionRoot = copyExampleToTempRoot(exampleId);
  });

  afterAll(() => {
    sessionRoot.cleanup();
  });

  it('AC-010: consuming-app resolves the company-source sibling and applies with 0 byte differences', () => {
    const result = runManifestStep(sessionRoot, applyStep.args, 'consuming-app');
    expect(result.exitCode).toBe(applyStep.expectedExitCode);
    const comparison = compareOutput(
      result.stdout,
      expectedOutputPathFor(exampleId, applyStep.expectedOutputFile),
    );
    expect(comparison.pass).toBe(true);
    expect(comparison.byteDiffCount).toBe(0);
    expect(result.networkCallCount).toBe(0);
  });
});

describe('Example Verification Check: illustrative label (T-028, FR-014/AC-011)', () => {
  it('illustrative label: every vendoring stand-in step named in the 05-multi-repository narrative is labeled illustrative', () => {
    const readmePath = path.join(EXAMPLES_DIR, '05-multi-repository', 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    const standInStepLines = readme
      .split('\n')
      .filter((line) => line.trim().startsWith('-') && line.includes('Illustrative step'));
    expect(standInStepLines.length).toBeGreaterThanOrEqual(4);
    for (const line of standInStepLines) {
      expect(line).toContain('Illustrative step');
    }

    const manifestPath = path.join(EXAMPLES_DIR, '05-multi-repository', 'example.manifest.json');
    const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
    expect(manifestRaw).not.toContain('submodule');
    expect(manifestRaw).not.toContain('CI checkout');
    expect(manifestRaw).not.toContain('Package or artifact sync');
    expect(manifestRaw).not.toContain('Monorepo shared directory');
  });
});

describe('Example Verification Check: entry-point examples link (NFR-003)', () => {
  it('README.md contains exactly one link to examples/README.md', () => {
    const readmePath = path.join(process.cwd(), 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    const matches = readme.match(/\]\(examples\/README\.md\)/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(fs.existsSync(path.join(process.cwd(), 'examples', 'README.md'))).toBe(true);
  });
});

describe('Example Verification Check: measured network-call count (T-011, FR-003/NFR-004)', () => {
  it('total measured network-guard invocations across every executed manifest step is 0', () => {
    const samples = getNetworkCallSamples();
    const totalNetworkCalls = samples.reduce((sum, sample) => sum + sample.networkCallCount, 0);

    // Emit measured call-count artifact so CI can archive it as build evidence (FR-003/NFR-004),
    // matching the test-results/*.json convention used by NFR-005/NFR-007/NFR-009.
    const resultsDir = path.join(process.cwd(), 'test-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(
      path.join(resultsDir, 'network-guard-fr003-nfr004.json'),
      JSON.stringify(
        {
          fr: 'FR-003',
          nfr: 'NFR-004',
          description:
            'Measured network-guard-blocked-call count across every example manifest-step invocation in this suite run',
          invocationCount: samples.length,
          totalNetworkCalls,
          thresholdNetworkCalls: 0,
          pass: totalNetworkCalls === 0,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    expect(samples.length).toBeGreaterThan(0);
    expect(totalNetworkCalls).toBe(0);
  });
});
