import { spawnSync } from 'child_process';
import * as path from 'path';

/**
 * Spawn the shipped binary and return stdout, stderr, and status as three
 * separate fields (T-001). The pre-existing runCli concatenated stdout+stderr on
 * the error path, which hid stream assignment; this helper keeps them separate so
 * the styling matrix can assert per-stream escape counts. A per-case `env`
 * override is merged over `process.env` so tests can force NO_COLOR / FORCE_COLOR.
 */

/** Absolute path to the compiled CLI entrypoint. */
export const CLI_BIN = path.join(__dirname, '..', '..', 'dist', 'cli', 'index.js');

export interface CliResult {
  stdout: string;
  stderr: string;
  status: number;
}

export function runCli(
  cwd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): CliResult {
  const r = spawnSync('node', [CLI_BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
  return {
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    status: r.status ?? (r.signal ? 1 : 0),
  };
}
