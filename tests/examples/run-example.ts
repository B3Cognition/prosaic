import { execFileSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { NETWORK_GUARD_PRELOAD_PATH } from './network-guard';
import { FS_GUARD_PRELOAD_PATH } from './fs-guard';

const REPO_ROOT = fs.realpathSync(path.join(__dirname, '..', '..'));
const BIN = path.join(REPO_ROOT, 'dist', 'cli', 'index.js');
export const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');

export interface StepResult {
  stdout: string;
  exitCode: number;
  /** Measured count of blocked network-guard invocations during this step (FR-003/NFR-004). */
  networkCallCount: number;
  /** Measured count of filesystem accesses outside the temp root / prosaic install dir during this step (FR-002). */
  externalFileAccessCount: number;
}

export interface NetworkCallSample {
  args: string[];
  networkCallCount: number;
}

export interface FsAccessSample {
  args: string[];
  externalFileAccessCount: number;
}

const networkCallSamples: NetworkCallSample[] = [];
const fsAccessSamples: FsAccessSample[] = [];

/** Every measured network-call sample recorded by runManifestStep so far, for CI artifact aggregation. */
export function getNetworkCallSamples(): NetworkCallSample[] {
  return networkCallSamples;
}

/** Every measured external-filesystem-access sample recorded by runManifestStep so far, for CI artifact aggregation. */
export function getFsAccessSamples(): FsAccessSample[] {
  return fsAccessSamples;
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

function readAndClearFsAccessCount(countFile: string): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(countFile, 'utf8')) as { externalFileAccessCount: number };
    return parsed.externalFileAccessCount;
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
 * Copy `sourceDir`'s own files into a fresh temp root. The temp root starts
 * empty and receives only this directory's contents; runManifestStep then
 * measures every filesystem access the CLI subprocess makes outside this
 * root (and outside the prosaic install dir) via fs-guard-preload.js,
 * turning "no other file is available" from an architectural assumption
 * into a measured runtime count (FR-002).
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
  const uid = `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const networkCountFile = path.join(os.tmpdir(), `prosaic-network-guard-${uid}.json`);
  const fsCountFile = path.join(os.tmpdir(), `prosaic-fs-guard-${uid}.json`);
  const env = {
    ...process.env,
    NODE_OPTIONS: `--require ${NETWORK_GUARD_PRELOAD_PATH} --require ${FS_GUARD_PRELOAD_PATH}`,
    NETWORK_GUARD_COUNT_FILE: networkCountFile,
    FS_GUARD_COUNT_FILE: fsCountFile,
    FS_GUARD_ALLOWED_ROOTS: JSON.stringify([tempRoot.root, REPO_ROOT]),
  };
  let networkCallCount: number;
  let externalFileAccessCount: number;
  try {
    const stdout = execFileSync('node', [BIN, ...args], {
      cwd: cwdRelPath ? tempRoot.p(cwdRelPath) : tempRoot.root,
      encoding: 'utf8',
      env,
    });
    networkCallCount = readAndClearNetworkCallCount(networkCountFile);
    externalFileAccessCount = readAndClearFsAccessCount(fsCountFile);
    networkCallSamples.push({ args, networkCallCount });
    fsAccessSamples.push({ args, externalFileAccessCount });
    return { stdout, exitCode: 0, networkCallCount, externalFileAccessCount };
  } catch (e: any) {
    const stdout = (e.stdout ?? '') + (e.stderr ?? '');
    networkCallCount = readAndClearNetworkCallCount(networkCountFile);
    externalFileAccessCount = readAndClearFsAccessCount(fsCountFile);
    networkCallSamples.push({ args, networkCallCount });
    fsAccessSamples.push({ args, externalFileAccessCount });
    return { stdout, exitCode: e.status ?? 1, networkCallCount, externalFileAccessCount };
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
