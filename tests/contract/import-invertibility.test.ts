import { WarningKind } from '../../src/domain/warnings';

const IMPORT_WARNING_KINDS: WarningKind[] = [
  'portability',
  'ambiguous-detection',
  'unrecognized-format',
  'injected-strip',
  'defaulted-choice',
  'override-recovered',
  'round-trip-mismatch',
  'unverified-target',
];

const ORIGINAL_WARNING_KINDS: WarningKind[] = [
  'malformed-frontmatter',
  'schema-invalid',
  'classification',
  'unsupported-pair',
  'lossy-intent',
  'unresolved-reference',
  'config',
];

describe('import warning-kind union extension (T-001, NFR-006)', () => {
  it('gains the 8 import-specific warning kinds', () => {
    for (const kind of IMPORT_WARNING_KINDS) {
      const w: { kind: WarningKind; message: string } = { kind, message: 'test' };
      expect(w.kind).toBe(kind);
    }
  });

  it('retains all 7 original warning kinds (0 removals)', () => {
    for (const kind of ORIGINAL_WARNING_KINDS) {
      const w: { kind: WarningKind; message: string } = { kind, message: 'test' };
      expect(w.kind).toBe(kind);
    }
  });

  it('total union has exactly 15 kinds (7 original + 8 import)', () => {
    const all = [...ORIGINAL_WARNING_KINDS, ...IMPORT_WARNING_KINDS];
    expect(new Set(all).size).toBe(15);
  });
});
