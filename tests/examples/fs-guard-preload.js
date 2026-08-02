'use strict';

/**
 * `--require`-loadable preload script (NODE_OPTIONS) that measures every
 * filesystem access the CLI subprocess performs outside a declared set of
 * allowed roots. Used by run-example.ts to prove Example manifest steps
 * read/write zero external files (FR-002), mirroring
 * network-guard-preload.js's measured-count mechanism for FR-003/NFR-004.
 *
 * FS_GUARD_ALLOWED_ROOTS must be set to a JSON array of absolute directory
 * paths: the example's own temp-root copy, plus the prosaic installation
 * directory the CLI is loaded from (module loading of the CLI's own
 * dist/node_modules files is the tool's own mechanics, not an "external
 * file" the example command depends on). Any access resolving outside every
 * allowed root increments a counter, written to FS_GUARD_COUNT_FILE on
 * process exit as a measured artifact rather than an assumption-by-construction.
 *
 * Only content-affecting operations are guarded (read/write/copy/rename/
 * remove/mkdir) — not existence/listing probes (`existsSync`, `readdirSync`,
 * `realpathSync`). The CLI's documented ancestor- and global-config
 * precedence search (FR-031) legitimately probes ancestor directories for a
 * config file that (in the examples, by design) never exists there; that
 * probing carries no file dependency unless a probe is followed by an
 * actual `readFileSync` of a found file, which this guard would catch.
 */

const fs = require('fs');
const path = require('path');

const GUARDED_FUNCTIONS = ['readFileSync', 'writeFileSync', 'mkdirSync', 'renameSync', 'rmSync', 'copyFileSync'];

const REALPATH_ORIGINAL = fs.realpathSync;

// Capture originals before any patching so internal use below (path
// resolution) never recurses into a guarded function.
const originals = {};
for (const fnName of GUARDED_FUNCTIONS) {
  originals[fnName] = fs[fnName];
}

const allowedRoots = JSON.parse(process.env.FS_GUARD_ALLOWED_ROOTS || '[]').map((root) => {
  try {
    return REALPATH_ORIGINAL(root);
  } catch {
    return path.resolve(root);
  }
});

let externalFileAccessCount = 0;
const externalAccessSamples = [];

function isWithinAllowedRoot(target) {
  return allowedRoots.some((root) => target === root || target.startsWith(root + path.sep));
}

/** Resolve `target` to its real path, walking up to the nearest existing ancestor for not-yet-created write targets. */
function resolveForCheck(target) {
  const resolved = path.resolve(target);
  try {
    return REALPATH_ORIGINAL(resolved);
  } catch {
    let dir = path.dirname(resolved);
    while (true) {
      try {
        const realDir = REALPATH_ORIGINAL(dir);
        return path.join(realDir, path.relative(dir, resolved));
      } catch {
        const parent = path.dirname(dir);
        if (parent === dir) {
          return resolved;
        }
        dir = parent;
      }
    }
  }
}

function guard(name, original) {
  return function guarded(target, ...rest) {
    if (typeof target === 'string') {
      const resolved = resolveForCheck(target);
      if (!isWithinAllowedRoot(resolved)) {
        externalFileAccessCount += 1;
        externalAccessSamples.push({ api: name, path: resolved });
      }
    }
    return original.apply(fs, [target, ...rest]);
  };
}

for (const fnName of GUARDED_FUNCTIONS) {
  fs[fnName] = guard(fnName, originals[fnName]);
}

if (process.env.FS_GUARD_COUNT_FILE) {
  process.on('exit', () => {
    try {
      originals.writeFileSync(
        process.env.FS_GUARD_COUNT_FILE,
        JSON.stringify({ externalFileAccessCount, externalAccessSamples }),
      );
    } catch {
      // Best-effort: the process is already exiting.
    }
  });
}
