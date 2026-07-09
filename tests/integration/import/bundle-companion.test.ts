import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { consumeCompanion, primaryBaseName } from '../../../src/import/bundle/companion';
import { reassociateBundle } from '../../../src/import/bundle/reassociate';
import { ALL_DESCRIPTORS } from '../../../src/registry/adapters';

const githubCopilot = ALL_DESCRIPTORS.find((d) => d.id === 'github-copilot')!;

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-test-')));
}

describe('bundle reassociation (T-020, FR-041, FR-073, FR-074, FR-075)', () => {
  it('re-associates resource files with the primary artifact (FR-073)', () => {
    const root = makeTempDir();
    try {
      // Create a "bundle" directory with primary + resource
      const bundleDir = path.join(root, '.claude', 'skills', 'my-skill');
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.writeFileSync(path.join(bundleDir, 'SKILL.md'), '---\nname: my-skill\ndescription: A skill\n---\n\nBody\n');
      fs.writeFileSync(path.join(bundleDir, 'resource.md'), '# Resource file');

      const primaryAbs = path.join(bundleDir, 'SKILL.md');
      const slotDir = path.join(root, '.claude', 'skills');
      const result = reassociateBundle(primaryAbs, slotDir, root, 'my-skill/SKILL.md');

      expect(result.resources.length).toBeGreaterThanOrEqual(1);
      expect(result.resources.some((r) => r.relPath === 'resource.md')).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('emits a warning for an unresolved intra-bundle reference (FR-075)', () => {
    const root = makeTempDir();
    try {
      const bundleDir = path.join(root, '.claude', 'skills', 'my-skill');
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.writeFileSync(path.join(bundleDir, 'SKILL.md'), '---\nname: my-skill\ndescription: A skill\n---\n\nSee [missing](./nonexistent.md)');
      fs.writeFileSync(path.join(bundleDir, 'resource.md'), 'See [missing](./nonexistent-ref.md) here');

      const primaryAbs = path.join(bundleDir, 'SKILL.md');
      const slotDir = path.join(root, '.claude', 'skills');
      const result = reassociateBundle(primaryAbs, slotDir, root, 'my-skill/SKILL.md');

      // A warning for unresolved reference in resource
      expect(result.warnings.some((w) => w.kind === 'unresolved-reference')).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('non-bundle file (directly in slot dir): no resources returned', () => {
    const root = makeTempDir();
    try {
      const slotDir = path.join(root, '.claude', 'skills');
      fs.mkdirSync(slotDir, { recursive: true });
      const primaryAbs = path.join(slotDir, 'flat-skill.md');
      fs.writeFileSync(primaryAbs, 'content');

      const result = reassociateBundle(primaryAbs, slotDir, root, '.claude/skills/flat-skill.md');
      expect(result.resources).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('companion consumption (T-021, FR-042, FR-076, FR-077)', () => {
  it('consumes exactly 1 companion file per pair (FR-042)', () => {
    const root = makeTempDir();
    try {
      const dir = path.join(root, '.github', 'instructions');
      fs.mkdirSync(dir, { recursive: true });

      const primaryAbs = path.join(dir, 'my-rule.instructions.md');
      fs.writeFileSync(primaryAbs, '---\napplyTo: "**"\n---\n\nContent\n');

      // Write the companion .metadata.json
      const companionAbs = path.join(dir, 'my-rule.instructions.md.metadata.json');
      fs.writeFileSync(companionAbs, '{\n  "source": "prosaic",\n  "name": "my-rule.instructions.md"\n}\n');

      const baseName = primaryBaseName(primaryAbs, '.instructions.md');
      const result = consumeCompanion(primaryAbs, baseName, githubCopilot, primaryAbs);

      // Should recover the companion data
      expect(result.warnings).toHaveLength(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('emits 0 companion-only fields as neutral keys (FR-077)', () => {
    const root = makeTempDir();
    try {
      const dir = path.join(root, '.github', 'instructions');
      fs.mkdirSync(dir, { recursive: true });

      const primaryAbs = path.join(dir, 'my-rule.instructions.md');
      fs.writeFileSync(primaryAbs, 'Content');

      const companionAbs = path.join(dir, 'my-rule.instructions.md.metadata.json');
      fs.writeFileSync(companionAbs, '{"source":"prosaic","name":"my-rule"}');

      const baseName = primaryBaseName(primaryAbs, '.instructions.md');
      const { recovered } = consumeCompanion(primaryAbs, baseName, githubCopilot, primaryAbs);

      // recovered should NOT contain neutral key names (they would need explicit mapping)
      const neutralKeys = ['execution', 'capability', 'effort', 'tools', 'invocation', 'visibility', 'color'];
      for (const nk of neutralKeys) {
        expect(recovered[nk]).toBeUndefined();
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
