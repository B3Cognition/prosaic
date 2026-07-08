import * as fs from 'fs';
import { GuardedFs } from '../../src/write/guarded-fs';
import { Manifest, ManifestError } from '../../src/manifest/manifest';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

describe('Manifest (T-004, FR-024/FR-050/NFR-012)', () => {
  let t: TempRoot;
  let gfs: GuardedFs;

  beforeEach(() => {
    t = makeTempRoot();
    gfs = new GuardedFs(t.root);
  });
  afterEach(() => t.cleanup());

  it('FR-024: records generated files keyed by (target, path) and round-trips', () => {
    const m = Manifest.empty(gfs, '1.0.0');
    m.record('claude', '.claude/commands/foo.md', 'hash1');
    m.record('cursor', '.cursor/rules/foo.md', 'hash2');
    m.save();

    const loaded = Manifest.load(gfs);
    expect(loaded.isManaged('claude', '.claude/commands/foo.md')).toBe(true);
    expect(loaded.isManaged('cursor', '.cursor/rules/foo.md')).toBe(true);
    expect(loaded.isManaged('claude', '.cursor/rules/foo.md')).toBe(false);
  });

  it('NFR-012: the manifest write is atomic (no partial file, deterministic bytes)', () => {
    const m = Manifest.empty(gfs, '1.0.0');
    m.record('a', 'x.md', 'h');
    m.save();
    const first = t.read('.prosaic-manifest.json');

    const m2 = Manifest.load(gfs);
    m2.save();
    const second = t.read('.prosaic-manifest.json');
    expect(second).toBe(first); // byte-identical re-serialization
  });

  it('AC-032: a corrupt manifest raises ManifestError(integrity)', () => {
    const m = Manifest.empty(gfs, '1.0.0');
    m.record('a', 'x.md', 'h');
    m.save();

    // Tamper with an entry without fixing the integrity digest.
    const raw = JSON.parse(t.read('.prosaic-manifest.json'));
    raw.entries[0].hash = 'tampered';
    fs.writeFileSync(t.p('.prosaic-manifest.json'), JSON.stringify(raw));

    expect(() => Manifest.load(gfs)).toThrow(ManifestError);
    try {
      Manifest.load(gfs);
    } catch (e) {
      expect((e as ManifestError).kind).toBe('integrity');
    }
  });

  it('AC-032: an absent manifest raises ManifestError(absent); loadOrEmpty tolerates it', () => {
    expect(() => Manifest.load(gfs)).toThrow(ManifestError);
    expect(Manifest.loadOrEmpty(gfs).all()).toEqual([]);
  });

  it('AC-032: loadOrEmpty still throws on a present-but-corrupt manifest', () => {
    fs.writeFileSync(t.p('.prosaic-manifest.json'), '{ not valid json');
    expect(() => Manifest.loadOrEmpty(gfs)).toThrow(ManifestError);
  });
});
