import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { NETWORK_GUARD_PRELOAD_PATH } from './network-guard';

const BIN = path.join(__dirname, '..', '..', 'dist', 'cli', 'index.js');
export const EXAMPLES_DIR = path.join(__dirname, '..', '..', 'examples');

export interface StepResult {
  stdout: string;
  exitCode: number;
  /** Measured count of blocked network-guard invocations during this step (FR-003/NFR-004). */
  networkCallCount: number;
}

export interface NetworkCallSample {
  args: string[];
  networkCallCount: number;
}

const networkCallSamples: NetworkCallSample[] = [];

/** Every measured network-call sample recorded by runManifestStep so far, for CI artifact aggregation. */
export function getNetworkCallSamples(): NetworkCallSample[] {
  return networkCallSamples;
}

function readAndClearNetworkCallCount(countFile: string): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(countFile, 'utf8')) as { networkCallCount: number };
    return parsed.networkCallCount;
  } catch {
    return 0;
  } finally {
    fs.rmSync(countFile, { force: true });
  }
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

/**
 * Run one manifest step's CLI invocation inside `tempRoot`, network-guarded.
 * `cwdRelPath` optionally scopes the invocation to a subdirectory of the temp
 * root (e.g. the multi-repository example's `consuming-app/`), still nested
 * inside the same disposable copy — never outside it.
 */
export function runManifestStep(tempRoot: TempRoot, args: string[], cwdRelPath?: string): StepResult {
  const countFile = path.join(
    os.tmpdir(),
    `prosaic-network-guard-${process.pid}-${crypto.randomBytes(4).toString('hex')}.json`,
  );
  let networkCallCount: number;
  try {
    const stdout = execFileSync('node', [BIN, ...args], {
      cwd: cwdRelPath ? tempRoot.p(cwdRelPath) : tempRoot.root,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: `--require ${NETWORK_GUARD_PRELOAD_PATH}`,
        NETWORK_GUARD_COUNT_FILE: countFile,
      },
    });
    networkCallCount = readAndClearNetworkCallCount(countFile);
    networkCallSamples.push({ args, networkCallCount });
    return { stdout, exitCode: 0, networkCallCount };
  } catch (e: any) {
    const stdout = (e.stdout ?? '') + (e.stderr ?? '');
    networkCallCount = readAndClearNetworkCallCount(countFile);
    networkCallSamples.push({ args, networkCallCount });
    return { stdout, exitCode: e.status ?? 1, networkCallCount };
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
