import { stripInject } from '../../../../src/import/neutralize/strip-inject';
import { ALL_DESCRIPTORS } from '../../../../src/registry/adapters';

describe('stripInject (T-007, FR-011, FR-012)', () => {
  const githubCopilot = ALL_DESCRIPTORS.find((d) => d.id === 'github-copilot')!;
  const goose = ALL_DESCRIPTORS.find((d) => d.id === 'goose')!;
  const cline = ALL_DESCRIPTORS.find((d) => d.id === 'cline')!;

  it('removes the applyTo injected key for github-copilot (FR-011)', () => {
    const fm = { name: 'my-rule', description: 'test', applyTo: '**' };
    const { frontmatter } = stripInject(fm, githubCopilot, 'test.md');
    expect(frontmatter.applyTo).toBeUndefined();
    expect(frontmatter.name).toBe('my-rule');
  });

  it('removes the version injected key for goose (FR-011)', () => {
    const fm = { name: 'recipe', version: '1.0.0', instructions: 'do stuff' };
    const { frontmatter } = stripInject(fm, goose, 'recipe.yaml');
    expect(frontmatter.version).toBeUndefined();
    expect(frontmatter.name).toBe('recipe');
  });

  it('records 0 injected keys under overrides (FR-012)', () => {
    const fm = { name: 'my-rule', applyTo: '**' };
    const { frontmatter } = stripInject(fm, githubCopilot, 'test.md');
    // overrides should not contain applyTo
    expect(JSON.stringify(frontmatter)).not.toContain('applyTo');
  });

  it('emits a warning when injected key value differs from default', () => {
    const fm = { name: 'my-rule', applyTo: '*.ts' }; // differs from '**'
    const { warnings } = stripInject(fm, githubCopilot, 'test.md');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].kind).toBe('injected-strip');
  });

  it('emits no warnings when injected value matches default', () => {
    const fm = { name: 'my-rule', applyTo: '**' }; // matches default
    const { warnings } = stripInject(fm, githubCopilot, 'test.md');
    expect(warnings).toHaveLength(0);
  });

  it('is a no-op for descriptors with empty inject map', () => {
    const fm = { name: 'rule', customKey: 'value' };
    const { frontmatter, warnings } = stripInject(fm, cline, 'rule.md');
    expect(frontmatter).toEqual(fm);
    expect(warnings).toHaveLength(0);
  });
});
