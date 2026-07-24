import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { NETWORK_GUARD_PRELOAD_PATH } from './network-guard';

const BIN = path.join(__dirname, '..', '..', 'dist', 'cli', 'index.js');
export const EXAMPLES_DIR = path.join(__dirname, '..', '..', 'examples');

export interface StepResult {
  stdout: string;
  exitCode: number;
}

export interface ComparisonResult {
  pass: boolean;
  byteDiffCount: number;
}

/**
 * Copy `sourceDir`'s own files into a fresh temp root. Because the temp root
 * starts empty and receives only this directory's contents, a subsequent CLI
 * invocation with `cwd: tempRoot` has no other file available to it (proves
 * FR-002 by construction).
 */
export function copyDirToTempRoot(sourceDir: string): TempRoot {
  const tempRoot = makeTempRoot();
  fs.cpSync(sourceDir, tempRoot.root, { recursive: true });
  return tempRoot;
}

/** Copy `examples/<exampleId>/`'s own files into a fresh temp root. */
export function copyExampleToTempRoot(exampleId: string): TempRoot {
  return copyDirToTempRoot(path.join(EXAMPLES_DIR, exampleId));
}

/** Run one manifest step's CLI invocation inside `tempRoot`, network-guarded. */
export function runManifestStep(tempRoot: TempRoot, args: string[]): StepResult {
  try {
    const stdout = execFileSync('node', [BIN, ...args], {
      cwd: tempRoot.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: `--require ${NETWORK_GUARD_PRELOAD_PATH}`,
      },
    });
    return { stdout, exitCode: 0 };
  } catch (e: any) {
    const stdout = (e.stdout ?? '') + (e.stderr ?? '');
    return { stdout, exitCode: e.status ?? 1 };
  }
}

/** Byte-for-byte comparison between live stdout and a committed Expected-Output Record. */
export function compareOutput(liveStdout: string, expectedOutputPath: string): ComparisonResult {
  const expected = fs.readFileSync(expectedOutputPath, 'utf8');
  if (liveStdout === expected) {
    return { pass: true, byteDiffCount: 0 };
  }
  const length = Math.max(liveStdout.length, expected.length);
  let byteDiffCount = 0;
  for (let i = 0; i < length; i += 1) {
    if (liveStdout[i] !== expected[i]) {
      byteDiffCount += 1;
    }
  }
  return { pass: false, byteDiffCount };
}
