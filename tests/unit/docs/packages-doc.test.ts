import * as fs from 'fs';
import * as path from 'path';

const DOCS_PATH = path.join(__dirname, '..', '..', '..', 'docs', 'packages.md');
const README_PATH = path.join(__dirname, '..', '..', '..', 'README.md');
const PACKAGE_SRC_DIR = path.join(__dirname, '..', '..', '..', 'src', 'package');

function readDoc(): string {
  return fs.readFileSync(DOCS_PATH, 'utf8');
}

describe('docs/packages.md content assertions (T-019, FR-033/FR-034/FR-035/FR-051, NFR-010)', () => {
  it('AC-050: required section headers are present', () => {
    const doc = readDoc();
    expect(doc).toMatch(/^# Package Deployment/m);
    expect(doc).toMatch(/^## Package Source Layout/m);
    expect(doc).toMatch(/^## Command Usage/m);
  });

  it('AC-019: an illustrative example application is explicitly labeled as an example', () => {
    const doc = readDoc();
    expect(doc).toMatch(/example application,\s+not a\s+Prosaic dependency/i);
  });

  it('NFR-010: the concurrent-invocation limitation is stated in the command-usage section', () => {
    const doc = readDoc();
    const usageSection = doc.split('## Command Usage')[1].split(/\n## /)[0];
    expect(usageSection).toMatch(/unsupported, user-managed/i);
    expect(usageSection).toMatch(/simultaneous/i);
  });

  it('AC-051: a dedicated provenance-ownership subsection is present', () => {
    const doc = readDoc();
    expect(doc).toMatch(/^## Provenance and Ownership/m);
    expect(doc).toMatch(/Provenance-Guarded\s+Operation/i);
  });

  it('README references src/package/ and docs/packages.md', () => {
    const readme = fs.readFileSync(README_PATH, 'utf8');
    expect(readme).toContain('src/package/');
    expect(readme).toContain('docs/packages.md');
  });

  it('FR-051/AC-048/AC-060: no unlabeled hardcoded application name in docs or src/package/**', () => {
    const doc = readDoc();
    // Every mention of the illustrative example name must sit within 200 chars
    // of an explicit "example application" disclaimer.
    const exampleMentions = [...doc.matchAll(/echelon/gi)];
    for (const m of exampleMentions) {
      const windowStart = Math.max(0, m.index! - 200);
      const windowEnd = Math.min(doc.length, m.index! + 200);
      expect(doc.slice(windowStart, windowEnd)).toMatch(/example application,\s+not a\s+Prosaic dependency/i);
    }

    const files = fs.readdirSync(PACKAGE_SRC_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = fs.readFileSync(path.join(PACKAGE_SRC_DIR, file), 'utf8');
      expect(content).not.toMatch(/echelon/i);
    }
  });
});
