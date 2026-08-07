import { spawnSync } from 'child_process';
import * as path from 'path';

/**
 * Spawn the shipped binary and return stdout, stderr, and status as three
 * separate fields (T-001). The pre-existing runCli concatenated stdout+stderr on
 * the error path, which hid stream assignment; this helper keeps them separate so
 * the styling matrix can assert per-stream escape counts. A per-case `env`
 * override replaces inherited NO_COLOR / FORCE_COLOR values so host defaults
 * cannot leak into explicit color-convention cases.
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
  const childEnv = { ...process.env };
  if (env) {
    delete childEnv.NO_COLOR;
    delete childEnv.FORCE_COLOR;
    Object.assign(childEnv, env);
  }
  const r = spawnSync('node', [CLI_BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: childEnv,
  });
  return {
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    status: r.status ?? (r.signal ? 1 : 0),
  };
}
