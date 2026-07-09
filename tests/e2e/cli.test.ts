import { execFileSync } from 'child_process';
import * as path from 'path';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

const BIN = path.join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

interface RunResult {
  stdout: string;
  status: number;
}

function runCli(cwd: string, args: string[]): RunResult {
  try {
    const stdout = execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
    return { stdout, status: 0 };
  } catch (e: any) {
    return { stdout: (e.stdout ?? '') + (e.stderr ?? ''), status: e.status ?? 1 };
  }
}

function seed(t: TempRoot): void {
  t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');
  t.write('.prosaic/commands/deploy.md', '---\ndescription: deploy\n---\nRun {{args}}.\n');
  t.write('prosaic.config.yaml', 'targets:\n  - claude-code\n  - cursor\n');
}

describe('CLI shipped binary (T-042, T-001)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seed(t);
  });
  afterEach(() => t.cleanup());

  it('prints a version string', () => {
    const r = runCli(t.root, ['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });

  it('AC-018: dry-run apply exits 0 with a non-empty plan, writing 0 files', () => {
    const r = runCli(t.root, ['apply', '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Dry run (apply)');
    expect(t.exists('.claude/commands/deploy.md')).toBe(false);
  });

  it('completes an apply → re-apply → revert lifecycle', () => {
    const apply1 = runCli(t.root, ['apply']);
    expect(apply1.status).toBe(0);
    expect(t.exists('.claude/commands/deploy.md')).toBe(true);
    expect(t.exists('.cursor/rules/style.mdc')).toBe(true);

    const apply2 = runCli(t.root, ['apply']);
    expect(apply2.status).toBe(0);
    expect(apply2.stdout).toContain('0 changed file(s)');

    const rev = runCli(t.root, ['revert']);
    expect(rev.status).toBe(0);
    expect(t.exists('.claude/commands/deploy.md')).toBe(false);
    expect(t.exists('.cursor/rules/style.mdc')).toBe(false);
  });

  it('AC-003: an unknown target aborts with a non-zero exit', () => {
    const r = runCli(t.root, ['apply', '--targets', 'ghost-tool']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('Unknown target');
  });
});
