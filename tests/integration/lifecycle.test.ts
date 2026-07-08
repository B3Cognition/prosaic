import * as fs from 'fs';
import { apply, revert } from '../../src/lifecycle/run';
import { Registry, StaticRegistrySource } from '../../src/registry/registry';
import { makeDescriptor } from '../helpers/descriptor-factory';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

/** Two targets that write into a shared directory, plus one command-only target. */
function testRegistry(): Registry {
  return new Registry(
    new StaticRegistrySource([
      makeDescriptor({ id: 'alpha', destinationDir: '.shared/rules', extension: '.md' }),
      makeDescriptor({ id: 'beta', destinationDir: '.shared/rules', extension: '.beta.md' }),
      makeDescriptor({
        id: 'cmdonly',
        destinationDir: '.cmd',
        capabilities: { rule: false, skill: false, subagent: false, command: true },
      }),
    ]),
  );
}

function seedSource(t: TempRoot): void {
  t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');
  t.write('.prosaic/commands/deploy.md', '---\ndescription: deploy\n---\nRun {{args}}.\n');
}

describe('apply lifecycle (T-029/T-030/T-036, FR-033/FR-039/NFR-001)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedSource(t);
  });
  afterEach(() => t.cleanup());

  it('AC-001: apply writes one output per supported pair', () => {
    const r = apply({ projectRoot: t.root, registry: testRegistry() });
    // alpha+beta support all types (rule+command x 2) = 4; cmdonly supports command only = 1.
    expect(r.created).toBe(5);
    expect(t.exists('.shared/rules/style.md')).toBe(true);
    expect(t.exists('.cmd/deploy.md')).toBe(true);
  });

  it('AC-002: unsupported pair is skipped with a warning, 0 files', () => {
    const r = apply({ projectRoot: t.root, registry: testRegistry() });
    const skip = r.warnings.find((w) => w.kind === 'unsupported-pair' && w.target === 'cmdonly');
    expect(skip).toBeDefined();
    expect(t.exists('.cmd/style.md')).toBe(false);
  });

  it('AC-004/NFR-001: a no-op re-apply reports 0 changed files, byte-identical', () => {
    apply({ projectRoot: t.root, registry: testRegistry() });
    const before = t.read('.shared/rules/style.md');
    const r2 = apply({ projectRoot: t.root, registry: testRegistry() });
    expect(r2.changedFiles).toBe(0);
    expect(r2.created).toBe(0);
    expect(t.read('.shared/rules/style.md')).toBe(before);
  });

  it('AC-005: a content-changing overwrite writes a backup first', () => {
    apply({ projectRoot: t.root, registry: testRegistry() });
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe VERY concise.\n');
    const r = apply({ projectRoot: t.root, registry: testRegistry() });
    expect(r.overwritten).toBeGreaterThanOrEqual(1);
    expect(r.backedUp).toBeGreaterThanOrEqual(1);
    expect(t.exists('.prosaic-backups')).toBe(true);
  });

  it('AC-003/FR-040: an unknown target aborts before any write', () => {
    expect(() =>
      apply({ projectRoot: t.root, registry: testRegistry(), cli: { targets: ['ghost'] } }),
    ).toThrow(/Unknown target/);
    expect(t.exists('.shared/rules/style.md')).toBe(false);
  });

  it('AC-035/FR-054: zero-target selection is a no-op writing 0 files', () => {
    const r = apply({ projectRoot: t.root, registry: testRegistry(), cli: { targets: [] } });
    expect(r.zeroTargets).toBe(true);
    expect(t.exists('.shared/rules/style.md')).toBe(false);
  });
});

describe('provenance + revert + reconcile (T-031/T-032/T-033, FR-061/FR-034/FR-036/FR-028)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedSource(t);
  });
  afterEach(() => t.cleanup());

  it('AC-007/FR-061: a user-authored file in a target dir is never modified', () => {
    t.write('.shared/rules/handwritten.md', 'MINE');
    apply({ projectRoot: t.root, registry: testRegistry() });
    expect(t.read('.shared/rules/handwritten.md')).toBe('MINE');
  });

  it('AC-006: revert removes exactly the recorded tool-generated files', () => {
    apply({ projectRoot: t.root, registry: testRegistry() });
    t.write('.shared/rules/handwritten.md', 'MINE');
    revert({ projectRoot: t.root, registry: testRegistry() });
    expect(t.exists('.shared/rules/style.md')).toBe(false);
    expect(t.read('.shared/rules/handwritten.md')).toBe('MINE');
  });

  it('AC-008: reverting one target leaves the sibling target files intact', () => {
    apply({ projectRoot: t.root, registry: testRegistry() });
    expect(t.exists('.shared/rules/style.md')).toBe(true); // alpha
    expect(t.exists('.shared/rules/style.beta.md')).toBe(true); // beta
    revert({ projectRoot: t.root, registry: testRegistry(), cli: { targets: ['alpha'] } });
    expect(t.exists('.shared/rules/style.md')).toBe(false); // alpha removed
    expect(t.exists('.shared/rules/style.beta.md')).toBe(true); // beta intact
  });

  it('AC-031: re-apply reconciles an orphaned output; unmanaged files untouched', () => {
    apply({ projectRoot: t.root, registry: testRegistry() });
    // Remove a source artifact so its outputs orphan.
    fs.rmSync(t.p('.prosaic/commands/deploy.md'));
    const r = apply({ projectRoot: t.root, registry: testRegistry() });
    expect(r.removed).toBeGreaterThanOrEqual(1);
    expect(t.exists('.cmd/deploy.md')).toBe(false);
  });

  it('AC-032/FR-050: revert with a corrupt manifest aborts and deletes 0 files', () => {
    apply({ projectRoot: t.root, registry: testRegistry() });
    fs.writeFileSync(t.p('.prosaic-manifest.json'), '{corrupt');
    expect(() => revert({ projectRoot: t.root, registry: testRegistry() })).toThrow();
    expect(t.exists('.shared/rules/style.md')).toBe(true);
  });

  it('FR-050: revert with an absent manifest aborts (deletes 0)', () => {
    expect(() => revert({ projectRoot: t.root, registry: testRegistry() })).toThrow();
  });
});

describe('dry-run (T-034, FR-037/FR-038/FR-063/AC-018/AC-030)', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
    seedSource(t);
  });
  afterEach(() => t.cleanup());

  it('AC-018: dry-run apply previews changes and writes 0 files', () => {
    const r = apply({ projectRoot: t.root, registry: testRegistry(), dryRun: true });
    expect(r.preview.length).toBeGreaterThan(0);
    expect(t.exists('.shared/rules/style.md')).toBe(false);
    expect(r.created).toBe(0);
  });

  it('AC-030: dry-run apply shows reconcile removals labeled, deletes 0', () => {
    apply({ projectRoot: t.root, registry: testRegistry() });
    fs.rmSync(t.p('.prosaic/commands/deploy.md'));
    const r = apply({ projectRoot: t.root, registry: testRegistry(), dryRun: true });
    expect(r.preview.some((l) => l.startsWith('remove'))).toBe(true);
    expect(t.exists('.cmd/deploy.md')).toBe(true); // not deleted in dry-run
  });

  it('AC-019: dry-run revert previews removals and deletes 0', () => {
    apply({ projectRoot: t.root, registry: testRegistry() });
    const r = revert({ projectRoot: t.root, registry: testRegistry(), dryRun: true });
    expect(r.removed).toBe(0);
    expect(t.exists('.shared/rules/style.md')).toBe(true);
  });
});
