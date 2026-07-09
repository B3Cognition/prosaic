import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { neutralize } from '../../../src/import/neutralize/neutralize';
import { validateGate } from '../../../src/import/neutralize/validate-gate';
import { writeSource } from '../../../src/import/write/source-writer';
import { idempotencyCheck } from '../../../src/import/verify/idempotency';
import { runPipeline } from '../../../src/pipeline/runner';
import { ALL_DESCRIPTORS } from '../../../src/registry/adapters';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'import-idempotency-nfr002.json');

const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'idem-test-')));
}

describe('source-level idempotency (T-016, FR-040, FR-072, NFR-002)', () => {
  it('two-pass 0-diff: re-importing freshly written source produces 0 changed files (FR-040, NFR-002)', () => {
    const root = makeTempDir();
    const sourceRoot = path.join(root, 'source');
    fs.mkdirSync(sourceRoot, { recursive: true });
    try {
      // Create a prosaic artifact, deploy it, import it, write it
      const artifact = {
        id: 'rules/idem-rule.md',
        type: 'rule' as const,
        frontmatter: { name: 'idem-rule', description: 'Idempotency test rule' },
        body: 'Rule body for idempotency.\n',
        sourcePath: 'rules/idem-rule.md',
      };

      const deployed = runPipeline(artifact, cline);
      const filePath = path.join(root, deployed.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, deployed.content);

      const relToRoot = deployed.path;
      const neutralResult = neutralize(filePath, relToRoot, cline, root);
      expect(neutralResult.ok).toBe(true);
      if (!neutralResult.ok) return;

      const gated = validateGate(neutralResult.result.artifact, relToRoot);
      expect(gated.ok).toBe(true);
      if (!gated.ok) return;

      // Write once
      const writeResult = writeSource(gated.artifact, sourceRoot, root, { overwrite: true });
      expect(writeResult.written).toBe(true);

      // Run idempotency check
      const idemResult = idempotencyCheck(gated.artifact, cline, sourceRoot, root);

      fs.mkdirSync(RESULTS_DIR, { recursive: true });
      fs.writeFileSync(
        ARTIFACT_PATH,
        JSON.stringify(
          {
            nfr: 'NFR-002',
            description: 'Source-level idempotency: second identical run produces 0 changed files',
            secondRunChangedFileCount: idemResult.divergences.length,
            idempotent: idemResult.idempotent,
            pass: idemResult.idempotent && idemResult.divergences.length === 0,
            recordedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );

      expect(idemResult.idempotent).toBe(true);
      expect(idemResult.divergences).toHaveLength(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
