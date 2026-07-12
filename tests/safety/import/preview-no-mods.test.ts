import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeSource } from '../../../src/import/write/source-writer';
import { Artifact } from '../../../src/domain/types';
import { FsMutation, instrumentFsMutations, snapshotTree, diffTrees } from './fs-instrument';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'import-preview-nomods-fr069.json');

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'preview-test-')));
}

function makeArtifact(sourcePath: string, resources?: Artifact['resources']): Artifact {
  return {
    id: sourcePath,
    type: 'rule',
    frontmatter: { name: 'preview-rule' },
    body: 'Rule body.\n',
    sourcePath,
    resources,
  };
}

/**
 * FR-069: preview (dry-run) mode performs exactly 0 filesystem modifications.
 *
 * Measured, not sampled: a full recursive sha256 snapshot of the project tree is
 * taken before and after exercising every preview code path, and the real `fs`
 * mutating syscalls are instrumented throughout. The measurable target is met
 * only when both the observed mutation count AND the before/after tree diff are 0.
 */
describe('preview mode performs 0 filesystem modifications — measured runtime (T-015, FR-035, FR-069)', () => {
  let previewPathsExercised = 0;
  let observedMutations = 0;
  let filesModified = 0;
  let treeDiff: string[] = [];

  afterAll(() => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          fr: 'FR-069',
          requirements: ['FR-035', 'FR-069'],
          evidenceKind: 'measured_runtime',
          description:
            'Preview (dry-run) mode makes exactly 0 filesystem modifications across every preview code ' +
            'path (create, overwrite, collision, bundle resources, escaping): measured by a full sha256 ' +
            'tree diff plus fs-syscall instrumentation.',
          previewPathsExercised,
          observedMutations,
          filesModified,
          treeDiff,
          measurableTarget: 'exactly 0 filesystem modifications in preview mode',
          pass: previewPathsExercised > 0 && observedMutations === 0 && filesModified === 0,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  it('exercises all preview paths with 0 real writes and a byte-identical tree', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(path.join(sourceRoot, 'rules'), { recursive: true });
    // Pre-populate a user-authored file so overwrite/collision paths have a target.
    fs.writeFileSync(path.join(sourceRoot, 'rules', 'existing.md'), '# User authored\n');

    const before = snapshotTree(root);
    const mutations: FsMutation[] = [];
    const restore = instrumentFsMutations(mutations);
    try {
      // Path 1: preview creating a brand-new file.
      const create = writeSource(makeArtifact('rules/new.md'), sourceRoot, root, { dryRun: true });
      expect(create.written).toBe(false);
      expect(create.preview).toContain('[create]');
      previewPathsExercised++;

      // Path 2: preview overwriting an existing file (dryRun + overwrite).
      const overwrite = writeSource(makeArtifact('rules/existing.md'), sourceRoot, root, {
        dryRun: true,
        overwrite: true,
      });
      expect(overwrite.written).toBe(false);
      expect(overwrite.preview).toContain('[overwrite]');
      previewPathsExercised++;

      // Path 3: preview hitting a collision (dryRun, no overwrite).
      const collision = writeSource(makeArtifact('rules/existing.md'), sourceRoot, root, {
        dryRun: true,
      });
      expect(collision.written).toBe(false);
      expect(collision.collision).toBe(true);
      previewPathsExercised++;

      // Path 4: preview of a bundle-carrying artifact (resources must not be written).
      const bundled = makeArtifact('rules/bundled.md', [
        { relPath: 'assets/one.txt', content: 'one' },
        { relPath: 'assets/two.txt', content: 'two' },
      ]);
      const bundlePreview = writeSource(bundled, sourceRoot, root, { dryRun: true });
      expect(bundlePreview.written).toBe(false);
      previewPathsExercised++;

      // Path 5: preview of an escaping path (refused, still 0 writes).
      const escaping = writeSource(makeArtifact('../../../outside/escape.md'), sourceRoot, root, {
        dryRun: true,
      });
      expect(escaping.written).toBe(false);
      previewPathsExercised++;
    } finally {
      restore();
    }

    const after = snapshotTree(root);
    treeDiff = diffTrees(before, after);
    filesModified = treeDiff.length;
    observedMutations = mutations.filter(
      (m) => m.op === 'writeFileSync' || m.op === 'renameSync' || m.op === 'unlinkSync' || m.op === 'rmSync',
    ).length;

    fs.rmSync(root, { recursive: true, force: true });

    expect(observedMutations).toBe(0);
    expect(filesModified).toBe(0);
    expect(treeDiff).toEqual([]);
  });
});
