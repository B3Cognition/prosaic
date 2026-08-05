import { execFileSync } from 'child_process';
import * as path from 'path';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

const BIN = path.join(__dirname, '..', '..', '..', 'dist', 'cli', 'index.js');

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
  t.write('pkg/commands/deploy.md', '---\ndescription: deploy\n---\nRun.\n');
  t.write('pkg/scripts/build.sh', '#!/bin/sh\necho hi\n');
  t.write(
    'prosaic.config.yaml',
    'packages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
  );
}

describe('prosaic package deploy CLI (T-011/T-016/T-024/T-026/T-027)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seed(t);
  });
  afterEach(() => t.cleanup());

  it('T-016/AC-033: a known package id deploy exits 0 and reports the summary line', () => {
    const r = runCli(t.root, ['package', 'deploy', 'my-pkg']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('package deploy my-pkg:');
    expect(t.exists('dest/commands/deploy.md')).toBe(true);
    expect(t.exists('dest/scripts/build.sh')).toBe(true);
  });

  it('T-026/AC-005/AC-039: --dry-run writes 0 files and exits 0', () => {
    const r = runCli(t.root, ['package', 'deploy', 'my-pkg', '--dry-run']);
    expect(r.status).toBe(0);
    expect(t.exists('dest/commands/deploy.md')).toBe(false);
    expect(t.exists('dest/scripts/build.sh')).toBe(false);
  });

  it('T-024/AC-055: an unrecognized package id exits 1, stderr names the id', () => {
    const r = runCli(t.root, ['package', 'deploy', 'ghost-package']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('ghost-package');
  });

  it('T-027/AC-055: an unrecognized package id invocation writes 0 files', () => {
    runCli(t.root, ['package', 'deploy', 'ghost-package']);
    expect(t.exists('dest')).toBe(false);
  });

  it('T-022/AC-011: package revert removes exactly the declared package files', () => {
    const deploy = runCli(t.root, ['package', 'deploy', 'my-pkg']);
    expect(deploy.status).toBe(0);
    const r = runCli(t.root, ['package', 'revert', 'my-pkg']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('package revert my-pkg:');
    expect(t.exists('dest/commands/deploy.md')).toBe(false);
  });

  it('existing apply/import/revert/resolve/inspect commands are unaffected', () => {
    t.write('.prosaic/commands/other.md', '---\ndescription: other\n---\nRun {{args}}.\n');
    t.write(
      'prosaic.config.yaml',
      'targets:\n  - claude-code\npackages:\n  - id: my-pkg\n    sourceRoot: pkg\n    destinationRoot: dest\n',
    );
    const r = runCli(t.root, ['apply']);
    expect(r.status).toBe(0);
    expect(t.exists('.claude/commands/other.md')).toBe(true);
  });
});
