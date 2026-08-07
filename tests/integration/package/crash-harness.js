#!/usr/bin/env node
/**
 * Child-process kill harness for T-015 (atomicity recovery). Instruments
 * fs.renameSync — the single syscall both the staging phase (T-008, via
 * writeFileAtomic's temp-plus-rename) and the commit phase (T-009, via
 * moveFileAtomic) route every mutation through — and self-SIGKILLs
 * immediately before the Nth call, deterministically simulating a process
 * kill at a precise checkpoint without racing on wall-clock timing.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = process.env.PROSAIC_TEST_PROJECT_ROOT;
const packageId = process.env.PROSAIC_TEST_PACKAGE_ID;
const crashAfterRenames = Number(process.env.PROSAIC_TEST_CRASH_AFTER_RENAMES);

let renameCount = 0;
const originalRename = fs.renameSync;
fs.renameSync = function patchedRenameSync(...args) {
  if (renameCount === crashAfterRenames) {
    process.kill(process.pid, 'SIGKILL');
  }
  renameCount += 1;
  return originalRename.apply(fs, args);
};

const { deployPackage } = require(path.join(__dirname, '..', '..', '..', 'dist', 'package', 'run'));
deployPackage({ projectRoot, packageId });
