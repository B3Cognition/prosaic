import { extractBody } from '../../../../src/import/neutralize/extract-body';

describe('extractBody (T-011, FR-018, FR-061, FR-083)', () => {
  it('extracts the body field into the neutral body (FR-018)', () => {
    const fm = { name: 'cmd', prompt: 'Do the thing with {{args}}' };
    const { frontmatter, body, warnings } = extractBody(fm, '', 'prompt', 'cmd.toml');
    expect(body).toBe('Do the thing with {{args}}');
    expect(frontmatter.prompt).toBeUndefined(); // FR-083: field removed from frontmatter
    expect(frontmatter.name).toBe('cmd');
    expect(warnings).toHaveLength(0);
  });

  it('leaves 0 folded fields in the reconstructed frontmatter (FR-083)', () => {
    const fm = { instructions: 'Do something', name: 'recipe' };
    const { frontmatter } = extractBody(fm, '', 'instructions', 'recipe.yaml');
    expect(Object.keys(frontmatter)).not.toContain('instructions');
  });

  it('sets neutral body to empty and emits 1 warning when body field absent (FR-061)', () => {
    const fm = { name: 'cmd' }; // missing 'prompt'
    const { body, warnings } = extractBody(fm, '', 'prompt', 'cmd.toml');
    expect(body).toBe('');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe('malformed-frontmatter');
    expect(warnings[0].message).toContain('prompt');
  });

  it('when bodyField is undefined returns inline body unchanged', () => {
    const fm = { name: 'rule' };
    const inlineBody = 'This is the rule body.';
    const { body, frontmatter, warnings } = extractBody(fm, inlineBody, undefined, 'rule.md');
    expect(body).toBe(inlineBody);
    expect(frontmatter).toEqual(fm);
    expect(warnings).toHaveLength(0);
  });

  it('handles non-string body field values by JSON-serializing', () => {
    const fm = { name: 'cmd', prompt: 42 };
    const { body } = extractBody(fm, '', 'prompt', 'cmd.toml');
    expect(body).toBe('42');
  });
});
