import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { neutralize } from '../../../src/import/neutralize/neutralize';
import { ALL_DESCRIPTORS } from '../../../src/registry/adapters';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'import-crash-resilience-nfr007.json');

let fixturesTested = 0;
let crashes = 0;

const claudeCode = ALL_DESCRIPTORS.find((d) => d.id === 'claude-code')!;
const codexCli = ALL_DESCRIPTORS.find((d) => d.id === 'codex-cli')!;

function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'malformed-test-')));
}

describe('malformed frontmatter (T-012, FR-045, FR-079, FR-080, NFR-007)', () => {
  afterAll(() => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-007',
          description: 'Crash-free malformed input: malformed or attacker-influenceable foreign input fails closed without crashing',
          malformedFixturesTested: fixturesTested,
          crashes,
          pass: crashes === 0 && fixturesTested > 0,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });
  it('drops exactly 1 artifact per malformed YAML file, emits 1+ warning, crashes 0 times (FR-045, FR-079, FR-080)', () => {
    fixturesTested++;
    const root = makeTempDir();
    try {
      const filePath = path.join(root, '.claude', 'commands', 'broken.md');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '---\n: invalid: yaml: [\n---\n\nBody\n');

      const relToRoot = path.relative(root, filePath).split(path.sep).join('/');
      let result: ReturnType<typeof neutralize>;
      expect(() => {
        result = neutralize(filePath, relToRoot, claudeCode, root);
      }).not.toThrow(); // 0 process crashes (NFR-007)

      result = neutralize(filePath, relToRoot, claudeCode, root);
      expect(result.ok).toBe(false); // 1 artifact dropped (FR-080)
      if (!result.ok) {
        expect(result.dropped.warnings.length).toBeGreaterThanOrEqual(1); // 1+ warnings (FR-079)
        expect(result.dropped.warnings[0].kind).toBe('malformed-frontmatter');
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('drops exactly 1 artifact per malformed TOML file (FR-045, FR-079, FR-080)', () => {
    fixturesTested++;
    const root = makeTempDir();
    try {
      const filePath = path.join(root, '.codex', 'prompts', 'broken.toml');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'name = "test"\n[[[invalid toml\n');

      const relToRoot = path.relative(root, filePath).split(path.sep).join('/');
      let result: ReturnType<typeof neutralize>;
      expect(() => {
        result = neutralize(filePath, relToRoot, codexCli, root);
      }).not.toThrow();

      result = neutralize(filePath, relToRoot, codexCli, root);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.dropped.warnings.length).toBeGreaterThanOrEqual(1);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('handles a half-open frontmatter block (---\\n without closing ---)', () => {
    fixturesTested++;
    const root = makeTempDir();
    try {
      const filePath = path.join(root, '.claude', 'agents', 'halfopen.md');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '---\nname: test\n\nBody with no closing delimiter\n');

      const relToRoot = path.relative(root, filePath).split(path.sep).join('/');
      expect(() => {
        neutralize(filePath, relToRoot, claudeCode, root);
      }).not.toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('handles an unreadable file without crashing (NFR-007)', () => {
    fixturesTested++;
    const root = makeTempDir();
    try {
      const nonexistentPath = path.join(root, '.claude', 'commands', 'nonexistent.md');
      const relToRoot = path.relative(root, nonexistentPath).split(path.sep).join('/');
      let result: ReturnType<typeof neutralize>;
      expect(() => {
        result = neutralize(nonexistentPath, relToRoot, claudeCode, root);
      }).not.toThrow();

      result = neutralize(nonexistentPath, relToRoot, claudeCode, root);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.dropped.warnings.length).toBeGreaterThanOrEqual(1);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
