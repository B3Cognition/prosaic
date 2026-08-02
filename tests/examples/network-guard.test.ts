import { execFileSync } from 'child_process';
import { NETWORK_GUARD_PRELOAD_PATH } from './network-guard';

function runUnderGuard(script: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: `--require ${NETWORK_GUARD_PRELOAD_PATH}` },
    });
    return { stdout, status: 0 };
  } catch (e: any) {
    return { stdout: (e.stdout ?? '') + (e.stderr ?? ''), status: e.status ?? 1 };
  }
}

describe('network guard (T-004)', () => {
  it('fails fast with NetworkCallBlockedError on http.get', () => {
    const r = runUnderGuard("require('http').get('http://example.invalid')");
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('NetworkCallBlockedError');
  });

  it('fails fast on dns.lookup', () => {
    const r = runUnderGuard("require('dns').lookup('example.invalid', () => {})");
    expect(r.status).not.toBe(0);
    expect(r.stdout).toContain('NetworkCallBlockedError');
  });

  it('completes normally when no network I/O is performed', () => {
    const r = runUnderGuard("console.log('no network here')");
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('no network here');
  });
});
