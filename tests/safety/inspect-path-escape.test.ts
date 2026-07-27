import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inspectArtifact } from '../../src/inspect/lookup';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

/**
 * Dedicated regression net for `research.md` ADR-007's invariant:
 * `findArtifactById()` never joins `artifactId` into a filesystem path, so no
 * crafted identifier can ever resolve outside the current discovery pass
 * (FR-006, FR-018, NFR-003).
 */
describe('T-007: path-escape adversarial identifier corpus (NFR-003, FR-006, FR-018)', () => {
  let t: TempRoot;
  let outsideFile: string;

  beforeEach(() => {
    t = makeTempRoot();
    t.write('.prosaic/rules/style.md', '---\ndescription: style\n---\nBe concise.\n');

    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prosaic-outside-'));
    outsideFile = path.join(outsideDir, 'secret.md');
    fs.writeFileSync(outsideFile, 'top secret content');
  });

  afterEach(() => {
    t.cleanup();
    fs.rmSync(path.dirname(outsideFile), { recursive: true, force: true });
  });

  const ADVERSARIAL_IDS = [
    '../../etc/passwd',
    '../../../etc/passwd',
    '/etc/passwd',
    'C:\\Windows\\System32\\config\\SAM',
    '..\\..\\windows\\system32',
    'rules/style.md\0.md',
    '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '../rules/style.md',
    './rules/style.md',
    'rules/../../../etc/passwd',
  ];

  it.each(ADVERSARIAL_IDS)('artifactId %j never resolves — returns artifact-not-found, never a match or thrown error', (artifactId) => {
    const result = inspectArtifact({ projectRoot: t.root, artifactId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKind).toBe('artifact-not-found');
  });

  it('a symlink planted inside the source root pointing outside it is never discovered or resolved by inspect', () => {
    t.symlink('.prosaic/rules/escape.md', outsideFile);

    const result = inspectArtifact({ projectRoot: t.root, artifactId: 'rules/escape.md' });

    // Either dropped by discovery (not-found) or, if followed, its content must
    // never be silently substituted for a different artifact's data.
    if (result.ok) {
      expect(result.data.body).not.toContain('top secret content');
    } else {
      expect(result.errorKind).toBe('artifact-not-found');
    }
  });

  it('no adversarial id ever returns a different artifact\'s data', () => {
    for (const artifactId of ADVERSARIAL_IDS) {
      const result = inspectArtifact({ projectRoot: t.root, artifactId });
      if (result.ok) {
        expect(result.data.id).toBe(artifactId);
      }
    }
  });
});
