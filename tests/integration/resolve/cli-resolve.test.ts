import { execFileSync } from 'child_process';
import * as path from 'path';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';
import { resolveExecutionData } from '../../../src/resolve/lookup';

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

describe('T-009: CLI `resolve` subcommand integration', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seed(t);
  });
  afterEach(() => t.cleanup());

  it('success: stdout JSON is byte-identical to JSON.stringify(resolveExecutionData().data)', () => {
    const r = runCli(t.root, ['resolve', 'rules/style.md', '--target', 'claude-code']);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');

    const libraryResult = resolveExecutionData({
      projectRoot: t.root,
      artifactId: 'rules/style.md',
      targetId: 'claude-code',
    });
    expect(libraryResult.ok).toBe(true);
    if (libraryResult.ok) {
      expect(r.stdout.trim()).toBe(JSON.stringify(libraryResult.data));
    }
  });

  it('errorKind unregistered-target: prints "error: ..." to stderr, exit code 1', () => {
    const r = runCli(t.root, ['resolve', 'rules/style.md', '--target', 'no-such-target']);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('error: Unknown target: "no-such-target"');
  });

  it('errorKind artifact-not-found: prints "error: ..." to stderr, exit code 1', () => {
    const r = runCli(t.root, ['resolve', 'rules/does-not-exist.md', '--target', 'claude-code']);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('error: Unknown artifact: "rules/does-not-exist.md"');
  });

  it('errorKind internal: prints "error: ..." to stderr, exit code 1', () => {
    // A malformed frontmatter value on the requested key triggers an internal
    // failure surfaced through the same resolveExecutionData() Result path.
    t.write('.prosaic/rules/broken.md', '---\ndescription: [unterminated\n---\nBody.\n');
    const r = runCli(t.root, ['resolve', 'rules/broken.md', '--target', 'claude-code']);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('error: ');
  });

  it('--source override is honored, matching apply()\'s existing CliOverrides precedent', () => {
    t.write('alt-source/rules/other.md', '---\ndescription: other\n---\nBody.\n');
    const r = runCli(t.root, [
      'resolve',
      'rules/other.md',
      '--target',
      'claude-code',
      '--source',
      'alt-source',
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.artifactId).toBe('rules/other.md');
  });

  it('missing required --target flag produces a usage error (yargs-native), not a silent success', () => {
    const r = runCli(t.root, ['resolve', 'rules/style.md']);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('Missing required argument: target');
  });

  it('AC-005: the resolve command performs 0 filesystem writes on success and every failure path', () => {
    const before = t.read('.prosaic/rules/style.md');

    runCli(t.root, ['resolve', 'rules/style.md', '--target', 'claude-code']);
    runCli(t.root, ['resolve', 'rules/style.md', '--target', 'no-such-target']);
    runCli(t.root, ['resolve', 'rules/does-not-exist.md', '--target', 'claude-code']);

    expect(t.read('.prosaic/rules/style.md')).toBe(before);
    expect(t.exists('.claude')).toBe(false);
  });
});
