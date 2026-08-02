import * as fs from 'fs';
import * as path from 'path';
import { inspectArtifact } from '../../../src/inspect/lookup';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

/**
 * Measured-runtime evidence for NFR-009: inspectArtifact() run against the
 * conformance-fixtures skill bundle resource — the largest bundled-resource
 * value present in the existing test fixture corpus (33 bytes, per
 * evidence-resolution.md ER-002) — with the byte-length comparison persisted
 * as archived evidence.
 */

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'inspect-resource-completeness-nfr009.json');
// Largest bundled-resource value in the existing fixture corpus (evidence-resolution.md ER-002):
// conformance-fixtures/markdown-frontmatter/claude-code/skill/.claude/skills/reference.md.
const LARGEST_FIXTURE_RESOURCE = '# Reference\n\nGreeting templates.\n';

describe('NFR-009 measured completeness: largest fixture-corpus bundled resource is returned byte-for-byte', () => {
  let t: TempRoot;
  beforeAll(() => {
    t = makeTempRoot();
    t.write('.prosaic/skills/greeter/SKILL.md', '---\nname: greeter\ndescription: d\n---\nGreet the user.\n');
    t.write('.prosaic/skills/greeter/reference.md', LARGEST_FIXTURE_RESOURCE);
  });
  afterAll(() => t.cleanup());

  it('NFR-009: the largest fixture-corpus bundled resource (33 bytes) is returned untruncated, unpaginated', () => {
    const result = inspectArtifact({ projectRoot: t.root, artifactId: 'skills/greeter/SKILL.md' });

    expect(result.ok).toBe(true);
    const resource = result.ok ? result.data.resources.find((r) => r.relPath === 'reference.md') : undefined;
    const sourceBytes = Buffer.byteLength(LARGEST_FIXTURE_RESOURCE);
    const returnedBytes = resource ? Buffer.byteLength(resource.content) : 0;
    const byteForByte = resource !== undefined && resource.content === LARGEST_FIXTURE_RESOURCE;

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-009',
          requirements: ['NFR-009'],
          evidenceKind: 'measured_runtime',
          description:
            'inspectArtifact() driven against the largest bundled-resource value present in the existing ' +
            'test fixture corpus (conformance-fixtures/markdown-frontmatter/claude-code/skill/.claude/skills/' +
            'reference.md, per evidence-resolution.md ER-002); confirms the returned resource content is ' +
            'byte-for-byte identical, not truncated or paginated (single resources[] entry, no page markers).',
          fixtureSourceBytes: sourceBytes,
          returnedBytes,
          byteForByte,
          truncatedOrPaginated: returnedBytes !== sourceBytes,
          resourceCount: result.ok ? result.data.resources.length : 0,
          measurableTarget:
            '100% byte-for-byte bundled-resource completeness with 0 truncation, for content up to 33 bytes',
          pass: result.ok && byteForByte && result.data.resources.length === 1,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    expect(byteForByte).toBe(true);
    if (result.ok) {
      expect(result.data.resources).toHaveLength(1);
    }
  });
});
