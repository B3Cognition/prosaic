import { execFileSync } from 'child_process';
import * as path from 'path';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';
import { inspectArtifact } from '../../../src/inspect/lookup';

const BIN = path.join(__dirname, '..', '..', '..', 'dist', 'cli', 'index.js');

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function runCli(cwd: string, args: string[]): RunResult {
  try {
    const stdout = execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { stdout, stderr: '', status: 0 };
  } catch (e: any) {
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', status: e.status ?? 1 };
  }
}

function seed(t: TempRoot): void {
  t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');
}

describe('T-003: CLI `inspect` subcommand integration', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seed(t);
  });
  afterEach(() => t.cleanup());

  it('success, flag absent: stdout JSON is byte-identical to JSON.stringify(inspectArtifact().data)', () => {
    const r = runCli(t.root, ['inspect', 'rules/style.md']);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');

    const libraryResult = inspectArtifact({ projectRoot: t.root, artifactId: 'rules/style.md' });
    expect(libraryResult.ok).toBe(true);
    if (libraryResult.ok) {
      expect(r.stdout.trim()).toBe(JSON.stringify(libraryResult.data));
    }
  });

  it('AC-016/AC-017: success with --json is byte-identical to the flag-absent invocation', () => {
    const withoutFlag = runCli(t.root, ['inspect', 'rules/style.md']);
    const withFlag = runCli(t.root, ['inspect', 'rules/style.md', '--json']);

    expect(withFlag.status).toBe(0);
    expect(withFlag.stdout).toBe(withoutFlag.stdout);
    expect(withFlag.stderr).toBe(withoutFlag.stderr);
  });

  it('AC-018: a nonexistent id produces the same error/exit-1 failure with and without --json', () => {
    const withoutFlag = runCli(t.root, ['inspect', 'rules/does-not-exist.md']);
    const withFlag = runCli(t.root, ['inspect', 'rules/does-not-exist.md', '--json']);

    expect(withoutFlag.status).toBe(1);
    expect(withoutFlag.stdout).toBe('');
    expect(withoutFlag.stderr).toContain('error: Unknown artifact: "rules/does-not-exist.md"');
    expect(withFlag.status).toBe(withoutFlag.status);
    expect(withFlag.stdout).toBe(withoutFlag.stdout);
    expect(withFlag.stderr).toBe(withoutFlag.stderr);
  });

  it('--source override is honored, matching resolve\'s existing CliOverrides precedent', () => {
    t.write('alt-source/rules/other.md', '---\ndescription: other\n---\nBody.\n');
    const r = runCli(t.root, ['inspect', 'rules/other.md', '--source', 'alt-source']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.id).toBe('rules/other.md');
  });

  it('no --target option exists on this command (FR-016)', () => {
    const r = runCli(t.root, ['inspect', 'rules/style.md', '--target', 'claude-code']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Unknown argument');
  });

  it('requires exactly one positional argument (FR-001)', () => {
    const r = runCli(t.root, ['inspect']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Not enough non-option arguments');
  });

  it('0 filesystem writes on success and failure paths', () => {
    const before = t.read('.prosaic/rules/style.md');

    runCli(t.root, ['inspect', 'rules/style.md']);
    runCli(t.root, ['inspect', 'rules/does-not-exist.md']);

    expect(t.read('.prosaic/rules/style.md')).toBe(before);
    expect(t.exists('.claude')).toBe(false);
  });

  it('T-003/FR-007: model_tier round-trips through the CLI unchanged', () => {
    t.write('.prosaic/commands/deploy.md', '---\nmodel_tier: balanced\n---\nDeploy.\n');

    const r = runCli(t.root, ['inspect', 'commands/deploy.md']);

    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.frontmatter.model_tier).toBe('balanced');
  });
});
