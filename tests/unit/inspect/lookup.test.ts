import * as fs from 'fs';
import * as path from 'path';
import { inspectArtifact } from '../../../src/inspect/lookup';
import { resolveExecutionData } from '../../../src/resolve/lookup';
import { Registry, StaticRegistrySource } from '../../../src/registry/registry';
import { makeDescriptor } from '../../helpers/descriptor-factory';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

function testRegistry(): Registry {
  return new Registry(new StaticRegistrySource([makeDescriptor({ id: 'known-target' })]));
}

describe('inspectArtifact', () => {
  let t: TempRoot;
  beforeEach(() => {
    t = makeTempRoot();
  });
  afterEach(() => t.cleanup());

  it('AC-001-AC-006: a standalone artifact returns all six fields, resources [], bundleRoot null', () => {
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');

    const result = inspectArtifact({ projectRoot: t.root, artifactId: 'rules/style.md' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe('rules/style.md');
    expect(result.data.type).toBe('rule');
    expect(result.data.frontmatter).toEqual({ description: 'style' });
    expect(result.data.body).toBe('Be concise.\n');
    expect(result.data.bundleRoot).toBeNull();
    expect(result.data.resources).toEqual([]);
  });

  it('AC-008-AC-010: a nonexistent id returns a distinguishable, non-throwing not-found failure', () => {
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');

    const result = inspectArtifact({ projectRoot: t.root, artifactId: 'rules/does-not-exist.md' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKind).toBe('artifact-not-found');
    if (result.errorKind === 'artifact-not-found') {
      expect(result.artifactId).toBe('rules/does-not-exist.md');
    }
  });

  it('AC-011: an id whose source file was dropped by discovery maps to the same not-found result as a nonexistent id', () => {
    t.write('.prosaic/rules/broken.md', '---\ndescription: [unterminated\n---\nBody.\n');

    const dropped = inspectArtifact({ projectRoot: t.root, artifactId: 'rules/broken.md' });
    const nonexistent = inspectArtifact({ projectRoot: t.root, artifactId: 'rules/never-existed.md' });

    expect(dropped.ok).toBe(false);
    expect(nonexistent.ok).toBe(false);
    if (dropped.ok || nonexistent.ok) return;
    expect(dropped.errorKind).toBe('artifact-not-found');
    expect(dropped.errorKind).toBe(nonexistent.errorKind);
  });

  it('AC-021: an id differing only in letter case from a real discovered id is never treated as a match', () => {
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');

    const flipped = inspectArtifact({ projectRoot: t.root, artifactId: 'Rules/Style.md' });
    const nonexistent = inspectArtifact({ projectRoot: t.root, artifactId: 'rules/never-existed.md' });

    expect(flipped.ok).toBe(false);
    expect(nonexistent.ok).toBe(false);
    if (flipped.ok || nonexistent.ok) return;
    expect(flipped.errorKind).toBe('artifact-not-found');
    expect(flipped.errorKind).toBe(nonexistent.errorKind);
  });

  describe('bundle artifact', () => {
    beforeEach(() => {
      t.write('.prosaic/skills/greeter/SKILL.md', '---\nname: greeter\ndescription: d\n---\nGreet the user.\n');
      t.write('.prosaic/skills/greeter/reference.md', '# Reference\n\nGreeting templates.\n');
      t.write('.prosaic/skills/greeter/sub/nested.md', 'nested content\n');
    });

    it('AC-012-AC-014: returns each resource relative to the bundle root, full content, and the bundle root', () => {
      const result = inspectArtifact({ projectRoot: t.root, artifactId: 'skills/greeter/SKILL.md' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.resources).toHaveLength(2);
      const byPath = new Map(result.data.resources.map((r) => [r.relPath, r.content]));
      expect(byPath.get('reference.md')).toBe('# Reference\n\nGreeting templates.\n');
      expect(byPath.get('sub/nested.md')).toBe('nested content\n');
      expect(result.data.bundleRoot).toBe(path.join(t.root, '.prosaic', 'skills', 'greeter'));
      for (const r of result.data.resources) {
        expect(path.isAbsolute(r.relPath)).toBe(false);
      }
    });

    it('AC-015: combining bundleRoot with each resource relPath yields a real filesystem location', () => {
      const result = inspectArtifact({ projectRoot: t.root, artifactId: 'skills/greeter/SKILL.md' });

      expect(result.ok).toBe(true);
      if (!result.ok || !result.data.bundleRoot) return;
      for (const r of result.data.resources) {
        expect(fs.existsSync(path.join(result.data.bundleRoot, r.relPath))).toBe(true);
      }
    });

    it('NFR-005: two consecutive calls against an unchanged source root produce byte-identical output', () => {
      const first = inspectArtifact({ projectRoot: t.root, artifactId: 'skills/greeter/SKILL.md' });
      const second = inspectArtifact({ projectRoot: t.root, artifactId: 'skills/greeter/SKILL.md' });

      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });

  it('NFR-002: a single inspectArtifact() invocation completes within 2x of resolve\'s measured baseline', () => {
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');

    const resolveStart = process.hrtime.bigint();
    resolveExecutionData({
      projectRoot: t.root,
      artifactId: 'rules/style.md',
      targetId: 'known-target',
      registry: testRegistry(),
    });
    const resolveNanos = Number(process.hrtime.bigint() - resolveStart);

    const inspectStart = process.hrtime.bigint();
    inspectArtifact({ projectRoot: t.root, artifactId: 'rules/style.md' });
    const inspectNanos = Number(process.hrtime.bigint() - inspectStart);

    // A floor avoids flaking on sub-millisecond timer noise while still enforcing the 2x bound.
    const floorNanos = 2_000_000;
    expect(inspectNanos).toBeLessThanOrEqual(Math.max(resolveNanos, floorNanos) * 2);
  });

  it('NFR-006/NFR-009: the largest existing fixture body/resource content is returned byte-for-byte, untruncated', () => {
    const body = 'x'.repeat(55);
    const resourceContent = 'y'.repeat(33);
    t.write('.prosaic/skills/big/SKILL.md', `---\nname: big\ndescription: d\n---\n${body}`);
    t.write('.prosaic/skills/big/reference.md', resourceContent);

    const result = inspectArtifact({ projectRoot: t.root, artifactId: 'skills/big/SKILL.md' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.body).toBe(body);
    expect(result.data.resources[0].content).toBe(resourceContent);
  });
});
