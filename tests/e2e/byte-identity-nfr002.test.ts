import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { apply } from '../../src/lifecycle/run';
import { builtinRegistry } from '../../src/registry/builtin';
import { plainTheme, styledTheme, Theme } from '../../src/cli/theme';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';
import { seedCorpus } from '../helpers/corpus';

// AC-016 / NFR-002 (verify: differing bytes = 0).
//
// The CLI output-styling enhancement must stay in the terminal presentation
// layer and never alter the bytes of distributed/rendered artifact files. This
// test renders the *distributed artifacts* (the files `apply` writes) under
// several styling environments — plain / NO_COLOR, forced-color / styled, and a
// bare default — over an identical seeded corpus, then diffs the written bytes
// across every environment against a baseline. Because styling only ever
// prepends/appends SGR codes to terminal *preview* text (never the artifact
// bytes), the distributed artifacts must be byte-identical across environments.
// A measured, 906-scoped artifact asserting differingBytes = 0 is emitted so CI
// can archive it as build evidence — distinct from the distribution spec's
// cross-env artifact (cross-env-nfr007.json), which measures a different NFR.

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'byte-identity-nfr002.json');

interface EnvCase {
  name: string;
  env: Record<string, string | undefined>;
  theme: Theme;
}

/** Styling environments that must not change a single distributed byte. */
const ENV_CASES: EnvCase[] = [
  // Baseline: forced-plain, non-color terminal.
  { name: 'plain-no-color', env: { NO_COLOR: '1', FORCE_COLOR: undefined, TERM: 'dumb' }, theme: plainTheme },
  // Forced-color, styled theme threaded through the run.
  { name: 'styled-force-color', env: { NO_COLOR: undefined, FORCE_COLOR: '1', TERM: 'xterm-256color' }, theme: styledTheme },
  // Bare environment, default (plain) theme.
  { name: 'default', env: { NO_COLOR: undefined, FORCE_COLOR: undefined, TERM: undefined }, theme: plainTheme },
];

/** Collect every distributed file (relative path → raw bytes), excluding state. */
function collect(root: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs);
      // Exclude prosaic's own state — only distributed artifacts count (A-001).
      if (rel.startsWith('.prosaic') || rel === '.prosaic-manifest.json') continue;
      if (e.isDirectory()) walk(abs);
      else out.set(rel, fs.readFileSync(abs));
    }
  };
  walk(root);
  return out;
}

/** Count differing bytes between two buffers (length delta counts as differing). */
function byteDiff(a: Buffer, b: Buffer): number {
  const max = Math.max(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff;
}

function sha256(b: Buffer): string {
  return crypto.createHash('sha256').update(b).digest('hex');
}

describe('AC-016 / NFR-002: distributed artifact bytes are identical across styling environments', () => {
  const roots: TempRoot[] = [];
  afterAll(() => roots.forEach((r) => r.cleanup()));

  it('renders byte-identical distributed artifacts under every styling environment (differingBytes = 0)', () => {
    const saved = {
      NO_COLOR: process.env.NO_COLOR,
      FORCE_COLOR: process.env.FORCE_COLOR,
      TERM: process.env.TERM,
    };

    const snapshots: Array<{ name: string; files: Map<string, Buffer> }> = [];
    try {
      for (const c of ENV_CASES) {
        const t = makeTempRoot(`prosaic-nfr002-${c.name}-`);
        roots.push(t);
        // Identical inputs in every environment.
        seedCorpus(t, 24);

        for (const [k, v] of Object.entries(c.env)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }

        // Real (non-dry-run) apply: writes the distributed artifacts to disk.
        apply({ projectRoot: t.root, registry: builtinRegistry(), theme: c.theme });
        snapshots.push({ name: c.name, files: collect(t.root) });
      }
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }

    const baseline = snapshots[0];
    const baseKeys = [...baseline.files.keys()].sort();

    let totalDifferingBytes = 0;
    let totalDifferingFiles = 0;
    const perEnv = snapshots.slice(1).map((snap) => {
      const keys = [...snap.files.keys()].sort();
      const keysMatch = keys.length === baseKeys.length && keys.every((k, i) => k === baseKeys[i]);

      let envDiffBytes = 0;
      let envDiffFiles = 0;
      const divergent: Array<{ file: string; baselineSha: string; envSha: string }> = [];
      const union = new Set([...baseKeys, ...keys]);
      for (const rel of union) {
        const a = baseline.files.get(rel);
        const b = snap.files.get(rel);
        if (a && b) {
          if (!a.equals(b)) {
            envDiffFiles++;
            envDiffBytes += byteDiff(a, b);
            divergent.push({ file: rel, baselineSha: sha256(a), envSha: sha256(b) });
          }
        } else {
          // A file present in one environment but not the other is a divergence.
          envDiffFiles++;
          envDiffBytes += (a?.length ?? 0) + (b?.length ?? 0);
          divergent.push({ file: rel, baselineSha: a ? sha256(a) : '(absent)', envSha: b ? sha256(b) : '(absent)' });
        }
      }
      totalDifferingBytes += envDiffBytes;
      totalDifferingFiles += envDiffFiles;
      return { env: snap.name, baseline: baseline.name, keysMatch, differingFiles: envDiffFiles, differingBytes: envDiffBytes, divergent };
    });

    const pass = totalDifferingBytes === 0 && totalDifferingFiles === 0 && perEnv.every((e) => e.keysMatch);

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-002',
          ac: 'AC-016',
          evidenceKind: 'measured_runtime',
          description:
            'Distributed/rendered artifact bytes show 0 differences across styling environments (plain/NO_COLOR, styled/FORCE_COLOR, default)',
          nodeVersion: process.version,
          platform: process.platform,
          baselineEnv: baseline.name,
          environments: ENV_CASES.map((c) => c.name),
          fileCount: baseKeys.length,
          differingFiles: totalDifferingFiles,
          differingBytes: totalDifferingBytes,
          perEnv,
          measurableTarget: 'differing bytes between distributed artifacts across environments = 0',
          pass,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    for (const snap of snapshots.slice(1)) {
      expect([...snap.files.keys()].sort()).toEqual(baseKeys);
    }
    expect(totalDifferingBytes).toBe(0);
    expect(baseKeys.length).toBeGreaterThan(0);
  });
});
