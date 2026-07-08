import { parseArtifact, ParseError } from '../../../src/discovery/parse';
import { classify } from '../../../src/discovery/classify';
import { validateFrontmatter } from '../../../src/discovery/schemas';
import { discover } from '../../../src/discovery/discover';
import { makeTempRoot, TempRoot } from '../../helpers/temp-root';

describe('parse (T-006, FR-002)', () => {
  it('splits frontmatter map and body', () => {
    const r = parseArtifact('---\nname: foo\n---\n\nBody here\n');
    expect(r.frontmatter).toEqual({ name: 'foo' });
    expect(r.body.trim()).toBe('Body here');
  });
  it('no-frontmatter file yields empty map + whole body', () => {
    const r = parseArtifact('# Just markdown\n');
    expect(r.frontmatter).toEqual({});
    expect(r.body).toContain('Just markdown');
  });
  it('malformed (unterminated) frontmatter throws ParseError', () => {
    expect(() => parseArtifact('---\nname: foo\nbody without close')).toThrow(ParseError);
  });
  it('non-mapping frontmatter throws ParseError', () => {
    expect(() => parseArtifact('---\n- a\n- b\n---\nbody')).toThrow(ParseError);
  });
});

describe('classify (T-007, FR-001/FR-052)', () => {
  it('classifies by directory convention', () => {
    expect(classify('commands/foo.md', {})).toEqual({ ok: true, type: 'command' });
    expect(classify('skills/foo/SKILL.md', {})).toEqual({ ok: true, type: 'skill' });
    expect(classify('subagents/foo.md', {})).toEqual({ ok: true, type: 'subagent' });
    expect(classify('rules/foo.md', {})).toEqual({ ok: true, type: 'rule' });
  });
  it('classifies by frontmatter type', () => {
    expect(classify('misc/foo.md', { type: 'command' })).toEqual({ ok: true, type: 'command' });
  });
  it('excludes a zero-type artifact with a reason', () => {
    const r = classify('misc/foo.md', {});
    expect(r.ok).toBe(false);
  });
  it('excludes a conflicting (>1 type) artifact with a reason', () => {
    const r = classify('commands/foo.md', { type: 'skill' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/more than 1/);
  });
});

describe('schema validation (T-008, FR-003/FR-057)', () => {
  it('skill requires name + description', () => {
    expect(validateFrontmatter('skill', { name: 'x', description: 'y' }).ok).toBe(true);
    const bad = validateFrontmatter('skill', { name: 'x' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.field).toBe('description');
  });
});

describe('discover integration (T-009/T-010, FR-004/FR-005/FR-053/NFR-010)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('AC-029: empty source yields empty run with 0 artifacts', () => {
    t.write('.prosaic/.keep', '');
    const r = discover(t.p('.prosaic'), t.root);
    expect(r.artifacts.length).toBe(0);
    expect(r.report.empty).toBe(true);
  });

  it('AC-020: one malformed file is dropped with a warning; valid ones survive', () => {
    t.write('.prosaic/commands/good.md', '---\ndescription: ok\n---\nBody\n');
    t.write('.prosaic/commands/bad.md', '---\nname: [unterminated\n---\nBody\n');
    const r = discover(t.p('.prosaic'), t.root);
    expect(r.artifacts.map((a) => a.id)).toEqual(['commands/good.md']);
    expect(r.warnings.length).toBeGreaterThanOrEqual(1);
    expect(r.warnings.some((w) => w.artifact === 'commands/bad.md')).toBe(true);
  });

  it('collects skill bundle resources', () => {
    t.write('.prosaic/skills/greet/SKILL.md', '---\nname: greet\ndescription: d\n---\nUse [ref](./ref.md)\n');
    t.write('.prosaic/skills/greet/ref.md', 'resource');
    const r = discover(t.p('.prosaic'), t.root);
    const skill = r.artifacts.find((a) => a.type === 'skill');
    expect(skill?.resources?.map((x) => x.relPath)).toEqual(['ref.md']);
  });
});
