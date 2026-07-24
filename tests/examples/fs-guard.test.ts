import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FS_GUARD_PRELOAD_PATH } from './fs-guard';

function runUnderGuard(script: string, allowedRoots: string[], countFile: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', ['-e', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: `--require ${FS_GUARD_PRELOAD_PATH}`,
        FS_GUARD_ALLOWED_ROOTS: JSON.stringify(allowedRoots),
        FS_GUARD_COUNT_FILE: countFile,
      },
    });
    return { stdout, status: 0 };
  } catch (e: any) {
    return { stdout: (e.stdout ?? '') + (e.stderr ?? ''), status: e.status ?? 1 };
  }
}

function readCount(countFile: string): { externalFileAccessCount: number; externalAccessSamples: unknown[] } {
  const parsed = JSON.parse(fs.readFileSync(countFile, 'utf8'));
  fs.rmSync(countFile, { force: true });
  return parsed;
}

describe('filesystem-access guard (FR-002)', () => {
  let allowedDir: string;
  let outsideDir: string;
  let countFile: string;

  beforeEach(() => {
    allowedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prosaic-fsguard-allowed-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prosaic-fsguard-outside-'));
    countFile = path.join(os.tmpdir(), `prosaic-fsguard-count-${process.pid}-${Date.now()}.json`);
  });

  afterEach(() => {
    fs.rmSync(allowedDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
    fs.rmSync(countFile, { force: true });
  });

  it('records 0 external accesses when every read/write stays within an allowed root', () => {
    const target = path.join(allowedDir, 'inside.txt');
    const r = runUnderGuard(
      `require('fs').writeFileSync(${JSON.stringify(target)}, 'hi'); require('fs').readFileSync(${JSON.stringify(target)}, 'utf8')`,
      [allowedDir],
      countFile,
    );
    expect(r.status).toBe(0);
    const { externalFileAccessCount } = readCount(countFile);
    expect(externalFileAccessCount).toBe(0);
  });

  it('measures exactly 1 external access when a read targets a path outside every allowed root', () => {
    const target = path.join(outsideDir, 'outside.txt');
    fs.writeFileSync(target, 'hi');
    const r = runUnderGuard(`require('fs').readFileSync(${JSON.stringify(target)}, 'utf8')`, [allowedDir], countFile);
    expect(r.status).toBe(0);
    const { externalFileAccessCount, externalAccessSamples } = readCount(countFile);
    expect(externalFileAccessCount).toBe(1);
    expect(externalAccessSamples).toHaveLength(1);
  });

  it('measures exactly 1 external access when a write targets a path outside every allowed root', () => {
    const target = path.join(outsideDir, 'written-by-guard-test.txt');
    const r = runUnderGuard(`require('fs').writeFileSync(${JSON.stringify(target)}, 'hi')`, [allowedDir], countFile);
    expect(r.status).toBe(0);
    fs.rmSync(target, { force: true });
    const { externalFileAccessCount } = readCount(countFile);
    expect(externalFileAccessCount).toBe(1);
  });
});
