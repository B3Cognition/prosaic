import { classifyPathValue, scanPortabilityIssues } from '../../../../src/import/portability/warnings';

describe('path portability classifier (T-017, FR-025, FR-026, FR-027)', () => {
  it('emits a portability warning for an absolute path (FR-025)', () => {
    const w = classifyPathValue('/absolute/path/to/file.md', 'somefield', 'test.md');
    expect(w).not.toBeNull();
    expect(w!.kind).toBe('portability');
    expect(w!.message).toContain('/absolute/path/to/file.md');
  });

  it('emits a portability warning for a root-escaping path (FR-025)', () => {
    const w = classifyPathValue('../../outside/root.md', 'somefield', 'test.md');
    expect(w).not.toBeNull();
    expect(w!.kind).toBe('portability');
  });

  it('emits a warning for a project-relative path (FR-026)', () => {
    const w = classifyPathValue('./relative/path.md', 'somefield', 'test.md');
    expect(w).not.toBeNull();
    expect(w!.kind).toBe('portability');
    expect(w!.message).toContain('./relative/path.md');
  });

  it('100% of portability warnings carry a non-empty remediation (FR-027)', () => {
    const values = ['/abs/path', '../../escape', './relative/file.md', 'sub/directory/file.md'];
    for (const val of values) {
      const w = classifyPathValue(val, 'field', 'test.md');
      if (w) {
        expect(w.remediation).toBeTruthy();
        expect(w.remediation.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns null for a plain string that is not a path', () => {
    const w = classifyPathValue('just some text', 'field', 'test.md');
    expect(w).toBeNull();
  });

  it('returns null for an HTTP URL', () => {
    const w = classifyPathValue('https://example.com/resource', 'field', 'test.md');
    expect(w).toBeNull();
  });

  describe('scanPortabilityIssues', () => {
    it('scans frontmatter values for path references (FR-025, FR-026)', () => {
      const warnings = scanPortabilityIssues(
        { somePath: '/absolute/path.md', title: 'Normal title' },
        '',
        'test.md',
      );
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0].kind).toBe('portability');
    });

    it('scans body for markdown link references', () => {
      const body = 'See [my file](./relative/path.md) for details';
      const warnings = scanPortabilityIssues({}, body, 'test.md');
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('all warnings from scan carry a non-empty remediation (FR-027)', () => {
      const warnings = scanPortabilityIssues(
        { path1: '/absolute/path', path2: '../../escape' },
        'Body with ./relative/ref.md',
        'test.md',
      );
      for (const w of warnings) {
        expect((w as any).remediation).toBeTruthy();
      }
    });
  });
});
