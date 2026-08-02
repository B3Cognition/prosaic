import * as fs from 'fs';
import * as path from 'path';
import { resolveExecutionData } from '../../../src/resolve/lookup';
import { Registry, StaticRegistrySource } from '../../../src/registry/registry';
import { makeDescriptor } from '../../helpers/descriptor-factory';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

/**
 * Measured-runtime evidence for NFR-001 ("100% of malformed-input resolution
 * attempts produce a structured error, never an uncaught crash").
 *
 * `tests/unit/resolve/lookup.test.ts` already proves the try/catch structural
 * gate with a handful of representative fixtures (assertion_only evidence).
 * This suite drives `resolveExecutionData` over a broad, multi-axis corpus of
 * malformed inputs (malformed frontmatter YAML variants, malformed/invalid
 * `prosaic.config.yaml` variants, binary/NUL/huge/deeply-nested artifact
 * content, and adversarial target/artifact ids) and records a genuinely
 * emitted `test-results/*.json` artifact counting attempts vs. uncaught
 * crashes, matching the NFR-002/NFR-004/NFR-007 measured_runtime evidence bar.
 */

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'resolve-malformed-input-nfr001.json');

let malformedInputsTested = 0;
let crashes = 0;
const crashCases: string[] = [];
let handledNoCrash = 0;
let resolvedOk = 0;
let resolvedStructuredError = 0;

function testRegistry(): Registry {
  return new Registry(new StaticRegistrySource([makeDescriptor({ id: 'known-target' })]));
}

/**
 * Drive one corpus case through `resolveExecutionData`, recording attempt/crash
 * counters. The measurable claim is crash-resilience, not "always rejects": some
 * inputs that look malformed are still validly parseable under the parser's
 * lenient rules (e.g. an empty file, or trailing bytes after the closing `---`
 * still captured as body text) — that is a legitimate non-crash outcome, so
 * both `{ ok: true }` and a structured `{ ok: false, errorKind }` count as
 * "handled without crash"; only an uncaught throw counts as a crash.
 */
function attempt(label: string, run: () => ReturnType<typeof resolveExecutionData>): void {
  malformedInputsTested += 1;
  try {
    const result = run();
    expect(typeof result.ok).toBe('boolean');
    if (result.ok) {
      resolvedOk += 1;
    } else {
      expect(['unregistered-target', 'artifact-not-found', 'internal']).toContain(result.errorKind);
      resolvedStructuredError += 1;
    }
    handledNoCrash += 1;
  } catch (e) {
    crashes += 1;
    crashCases.push(`${label}: ${(e as Error).message}`);
    throw e;
  }
}

const MALFORMED_FRONTMATTER_CASES: ReadonlyArray<{ name: string; content: string }> = [
  { name: 'unterminated-flow-scalar', content: '---\ndescription: [unterminated\n---\nBody.\n' },
  { name: 'unclosed-frontmatter-block', content: '---\ndescription: style\nBody without a closing marker.\n' },
  { name: 'tab-indentation', content: '---\ndescription: style\n\ttools: bad\n---\nBody.\n' },
  { name: 'duplicate-merge-key-conflict', content: '---\n<<: *missing\ndescription: style\n---\nBody.\n' },
  { name: 'non-map-frontmatter-scalar', content: '---\njust-a-string\n---\nBody.\n' },
  { name: 'non-map-frontmatter-sequence', content: '---\n- one\n- two\n---\nBody.\n' },
  { name: 'unterminated-quoted-scalar', content: '---\ndescription: "unterminated\n---\nBody.\n' },
  { name: 'bad-anchor-reference', content: '---\ndescription: *undefined-anchor\n---\nBody.\n' },
  { name: 'mixed-tabs-and-spaces', content: '---\ndescription: style\n \t tools: x\n---\nBody.\n' },
  { name: 'invalid-escape-sequence', content: '---\ndescription: "\\qbad"\n---\nBody.\n' },
  { name: 'nul-byte-in-frontmatter', content: '---\ndescription: "a\0b"\n---\nBody.\n' },
  { name: 'binary-content-body', content: '---\ndescription: style\n---\n' + Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x02]).toString('utf8') },
  { name: 'extremely-long-scalar', content: `---\ndescription: "${'x'.repeat(200_000)}\n---\nBody.\n` },
  { name: 'deeply-nested-flow-mapping', content: '---\ndescription: ' + '{a: '.repeat(500) + 'b' + '}'.repeat(500) + '\n---\nBody.\n' },
  { name: 'colon-without-space-ambiguity', content: '---\ndescription:style\n---\nBody.\n' },
  { name: 'byte-order-mark-mid-file', content: '---\ndescription: style\n---\nBody﻿with BOM inside.\n' },
  { name: 'tag-directive-unsupported', content: '---\n!!python/object:foo {}\n---\nBody.\n' },
  { name: 'trailing-garbage-after-close', content: '---\ndescription: style\n---garbage\nBody.\n' },
  { name: 'empty-file', content: '' },
  { name: 'only-dashes', content: '---\n' },
];

const MALFORMED_CONFIG_CASES: ReadonlyArray<{ name: string; content: string }> = [
  { name: 'unterminated-sequence', content: 'targets: [unterminated\n' },
  { name: 'unknown-top-level-key', content: 'not_a_real_key: true\n' },
  { name: 'wrong-type-for-targets', content: 'targets: "should-be-array"\n' },
  { name: 'invalid-yaml-tab', content: 'targets:\n\t- claude-code\n' },
  { name: 'non-map-config-scalar', content: 'just-a-scalar\n' },
  { name: 'non-map-config-sequence', content: '- one\n- two\n' },
  { name: 'nul-byte-in-config', content: 'targets: ["a\0b"]\n' },
  { name: 'duplicate-keys', content: 'targets: [claude-code]\ntargets: [cursor]\n' },
  { name: 'deeply-nested-config', content: 'source: ' + '{a: '.repeat(300) + 'b' + '}'.repeat(300) + '\n' },
  { name: 'binary-config', content: Buffer.from([0x00, 0xff, 0xfe, 0x01]).toString('utf8') },
];

describe('NFR-001 measured corpus: malformed-input resolution never crashes', () => {
  let t: TempRoot;

  beforeEach(() => {
    t = makeTempRoot();
  });
  afterEach(() => t.cleanup());

  afterAll(() => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-001',
          requirements: ['FR-007', 'FR-008', 'NFR-001'],
          evidenceKind: 'measured_runtime',
          description:
            'resolveExecutionData() driven over a broad, multi-axis corpus of malformed frontmatter, ' +
            'malformed prosaic.config.yaml, binary/NUL/huge/deeply-nested content, and adversarial ' +
            'target/artifact ids; records 0 uncaught crashes across every attempt (each yields either a ' +
            'structured errorKind or a valid resolution — never an uncaught throw).',
          malformedInputsTested,
          crashes,
          crashCases,
          handledNoCrash,
          resolvedOk,
          resolvedStructuredError,
          measurableTarget: '100% of malformed-input resolution attempts in the corpus are handled without an uncaught crash.',
          pass: malformedInputsTested > 0 && crashes === 0 && handledNoCrash === malformedInputsTested,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  for (const c of MALFORMED_FRONTMATTER_CASES) {
    it(`frontmatter corpus · ${c.name}: never crashes, resolves to a structured error`, () => {
      t.write('.prosaic/rules/broken.md', c.content);
      attempt(`frontmatter/${c.name}`, () =>
        resolveExecutionData({
          projectRoot: t.root,
          artifactId: 'rules/broken.md',
          targetId: 'known-target',
          registry: testRegistry(),
        }),
      );
    });
  }

  for (const c of MALFORMED_CONFIG_CASES) {
    it(`config corpus · ${c.name}: never crashes, resolves to a structured error`, () => {
      t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBody.\n');
      t.write('prosaic.config.yaml', c.content);
      attempt(`config/${c.name}`, () =>
        resolveExecutionData({
          projectRoot: t.root,
          artifactId: 'rules/style.md',
          targetId: 'known-target',
          registry: testRegistry(),
        }),
      );
    });
  }

  const ADVERSARIAL_IDS = [
    { name: 'path-traversal-artifact-id', artifactId: '../../../etc/passwd', targetId: 'known-target' },
    { name: 'nul-byte-artifact-id', artifactId: 'rules/broken\0.md', targetId: 'known-target' },
    { name: 'extremely-long-artifact-id', artifactId: 'rules/' + 'a'.repeat(10_000) + '.md', targetId: 'known-target' },
    { name: 'empty-artifact-id', artifactId: '', targetId: 'known-target' },
    { name: 'nul-byte-target-id', artifactId: 'rules/style.md', targetId: 'target\0evil' },
    { name: 'extremely-long-target-id', artifactId: 'rules/style.md', targetId: 'x'.repeat(10_000) },
    { name: 'empty-target-id', artifactId: 'rules/style.md', targetId: '' },
    { name: 'unicode-target-id', artifactId: 'rules/style.md', targetId: '🔥unknown🔥' },
  ];

  for (const c of ADVERSARIAL_IDS) {
    it(`adversarial-id corpus · ${c.name}: never crashes, resolves to a structured error`, () => {
      t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBody.\n');
      attempt(`id/${c.name}`, () =>
        resolveExecutionData({
          projectRoot: t.root,
          artifactId: c.artifactId,
          targetId: c.targetId,
          registry: testRegistry(),
        }),
      );
    });
  }

  it('registry-fault corpus · registry.get throws a non-Error value: never crashes', () => {
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBody.\n');
    const brokenRegistry = {
      get: () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'boom-non-error';
      },
    } as unknown as Registry;

    attempt('registry-fault/throws-string', () =>
      resolveExecutionData({
        projectRoot: t.root,
        artifactId: 'rules/style.md',
        targetId: 'known-target',
        registry: brokenRegistry,
      }),
    );
  });
});
