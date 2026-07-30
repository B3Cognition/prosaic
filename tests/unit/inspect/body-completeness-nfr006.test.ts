import * as fs from 'fs';
import * as path from 'path';
import { inspectArtifact } from '../../../src/inspect/lookup';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

/**
 * Measured-runtime evidence for NFR-006: inspectArtifact() run against the
 * command fixture body from tests/helpers/representative.ts — the largest
 * artifact-body value present in the existing test fixture corpus (55 bytes,
 * per evidence-resolution.md ER-002) — with the byte-length comparison
 * persisted as archived evidence.
 */

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'inspect-body-completeness-nfr006.json');
// Largest artifact-body value in the existing fixture corpus (evidence-resolution.md ER-002):
// tests/helpers/representative.ts's command/deploy artifact body.
const LARGEST_FIXTURE_BODY = 'Deploy using the arguments {{args}} and report status.\n';

describe('NFR-006 measured completeness: largest fixture-corpus body is returned byte-for-byte', () => {
  let t: TempRoot;
  beforeAll(() => {
    t = makeTempRoot();
    t.write('.prosaic/commands/deploy.md', `---\ndescription: Deploy the app.\n---\n${LARGEST_FIXTURE_BODY}`);
  });
  afterAll(() => t.cleanup());

  it('NFR-006: the largest fixture-corpus body (55 bytes) is returned untruncated', () => {
    const result = inspectArtifact({ projectRoot: t.root, artifactId: 'commands/deploy.md' });

    expect(result.ok).toBe(true);
    const sourceBytes = Buffer.byteLength(LARGEST_FIXTURE_BODY);
    const returnedBytes = result.ok ? Buffer.byteLength(result.data.body) : 0;
    const byteForByte = result.ok && result.data.body === LARGEST_FIXTURE_BODY;

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-006',
          requirements: ['NFR-006'],
          evidenceKind: 'measured_runtime',
          description:
            'inspectArtifact() driven against the largest artifact-body value present in the existing ' +
            "test fixture corpus (tests/helpers/representative.ts's command/deploy body, per " +
            'evidence-resolution.md ER-002); confirms the returned body is byte-for-byte identical, not truncated.',
          fixtureSourceBytes: sourceBytes,
          returnedBytes,
          byteForByte,
          truncated: returnedBytes !== sourceBytes,
          measurableTarget: '100% byte-for-byte body-content completeness with 0 truncation, for content up to 55 bytes',
          pass: result.ok && byteForByte,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    expect(byteForByte).toBe(true);
  });
});
