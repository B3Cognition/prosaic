import * as fs from 'fs';
import * as path from 'path';
import { inspectArtifact } from '../../../src/inspect/lookup';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

/**
 * Measured-runtime evidence for NFR-005: repeated inspectArtifact() invocations
 * for the same bundle artifact against an unchanged source root, serialized and
 * diffed byte-for-byte, with the comparison result persisted as archived evidence.
 */

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'inspect-determinism-nfr005.json');
const INVOCATIONS = 5;

describe('NFR-005 measured determinism: repeated inspect calls are byte-identical', () => {
  let t: TempRoot;
  beforeAll(() => {
    t = makeTempRoot();
    t.write('.prosaic/skills/greeter/SKILL.md', '---\nname: greeter\ndescription: d\n---\nGreet the user.\n');
    t.write('.prosaic/skills/greeter/reference.md', '# Reference\n\nGreeting templates.\n');
  });
  afterAll(() => t.cleanup());

  it(`NFR-005: ${INVOCATIONS} consecutive inspect calls against an unchanged source root are byte-for-byte identical`, () => {
    const outputs: string[] = [];
    for (let i = 0; i < INVOCATIONS; i++) {
      outputs.push(JSON.stringify(inspectArtifact({ projectRoot: t.root, artifactId: 'skills/greeter/SKILL.md' })));
    }

    const divergentCount = outputs.filter((o) => o !== outputs[0]).length;

    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-005',
          requirements: ['NFR-005'],
          evidenceKind: 'measured_runtime',
          description:
            `${INVOCATIONS} consecutive inspectArtifact() invocations for the same bundle artifact id ` +
            'against an unchanged source root, each serialized and compared byte-for-byte against the first.',
          invocations: INVOCATIONS,
          divergentCount,
          measurableTarget: '100% identical output across at least 2 consecutive invocations with no source changes',
          pass: divergentCount === 0,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

    expect(divergentCount).toBe(0);
  });
});
