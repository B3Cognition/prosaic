import { enumeratePackageSource } from '../../../src/package/enumerate';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';
import * as discoverModule from '../../../src/discovery/discover';
import * as walkModule from '../../../src/discovery/walk';
import * as runnerModule from '../../../src/pipeline/runner';

describe('enumeratePackageSource (T-006, FR-006..FR-012/FR-037..FR-041)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('AC-034: neutral vs. runtime partition correct at depth 1 and depth 3+', () => {
    t.write('pkg/commands/deploy.md', 'cmd');
    t.write('pkg/commands/deploy.companion.txt', 'companion');
    t.write('pkg/subagents/nested/deep/agent.md', 'agent');
    t.write('pkg/scripts/build.sh', '#!/bin/sh');
    t.write('pkg/templates/a/b/c/template.txt', 'tpl');

    const result = enumeratePackageSource(t.p('pkg'));

    const neutralRel = result.neutralFiles.map((f) => f.relPath).sort();
    expect(neutralRel).toEqual([
      'commands/deploy.companion.txt',
      'commands/deploy.md',
      'subagents/nested/deep/agent.md',
    ]);

    const runtimeRel = result.runtimeFiles.map((f) => f.relPath).sort();
    expect(runtimeRel).toEqual(['scripts/build.sh', 'templates/a/b/c/template.txt']);
  });

  it('AC-036: companion files travel with no individual config identification', () => {
    t.write('pkg/commands/foo.md', 'primary');
    t.write('pkg/commands/foo.companion.md', 'companion');
    const result = enumeratePackageSource(t.p('pkg'));
    expect(result.neutralFiles.map((f) => f.relPath).sort()).toEqual([
      'commands/foo.companion.md',
      'commands/foo.md',
    ]);
  });

  it('rejects a symlink resolving outside the package source root, enumeration continues', () => {
    const outside = makeTempRoot('prosaic-outside-');
    try {
      outside.write('secret.txt', 'nope');
      t.write('pkg/commands/ok.md', 'fine');
      t.symlink('pkg/scripts', outside.root);
      const result = enumeratePackageSource(t.p('pkg'));
      expect(result.warnings.some((w) => w.kind === 'package-path-rejected')).toBe(true);
      expect(result.runtimeFiles.some((f) => f.relPath.includes('secret'))).toBe(false);
      expect(result.neutralFiles.map((f) => f.relPath)).toEqual(['commands/ok.md']);
    } finally {
      outside.cleanup();
    }
  });

  it('rejects a nested symlink escape while continuing enumeration of siblings', () => {
    const outside = makeTempRoot('prosaic-outside-');
    try {
      outside.write('pwned.txt', 'nope');
      t.write('pkg/templates/good.txt', 'ok');
      t.symlink('pkg/templates/escape', outside.root);
      const result = enumeratePackageSource(t.p('pkg'));
      expect(result.warnings.some((w) => w.kind === 'package-path-rejected')).toBe(true);
      expect(result.runtimeFiles.map((f) => f.relPath)).toEqual(['templates/good.txt']);
    } finally {
      outside.cleanup();
    }
  });

  it('never parses/classifies a .md runtime-tree file (no discover/walkSource/runPipeline calls)', () => {
    t.write('pkg/docs/notes.md', '---\nname: not-an-artifact\n---\nbody');
    const result = enumeratePackageSource(t.p('pkg'));
    expect(result.runtimeFiles.map((f) => f.relPath)).toEqual(['docs/notes.md']);
    // No parse/classify metadata is attached — only path + mode fields.
    expect(Object.keys(result.runtimeFiles[0]).sort()).toEqual(['absPath', 'mode', 'relPath']);
  });

  it('makes zero calls to discover()/walkSource()/runPipeline() (spy assertion)', () => {
    const discoverSpy = jest.spyOn(discoverModule, 'discover');
    const walkSpy = jest.spyOn(walkModule, 'walkSource');
    const runnerSpy = jest.spyOn(runnerModule, 'runPipeline');
    t.write('pkg/commands/foo.md', 'x');
    t.write('pkg/docs/notes.md', 'y');
    enumeratePackageSource(t.p('pkg'));
    expect(discoverSpy).not.toHaveBeenCalled();
    expect(walkSpy).not.toHaveBeenCalled();
    expect(runnerSpy).not.toHaveBeenCalled();
    discoverSpy.mockRestore();
    walkSpy.mockRestore();
    runnerSpy.mockRestore();
  });

  it('an absent source root yields empty results, no throw', () => {
    const result = enumeratePackageSource(t.p('does-not-exist'));
    expect(result.neutralFiles).toEqual([]);
    expect(result.runtimeFiles).toEqual([]);
  });
});
