import * as path from 'path';
import { loadManifest } from './manifest-schema';

const FIXTURES = path.join(__dirname, 'fixtures');

describe('example manifest schema (T-002)', () => {
  it('parses a hand-crafted valid manifest fixture', () => {
    const manifest = loadManifest(path.join(FIXTURES, 'valid-manifest.json'), {
      requireNonHappyPath: false,
    });
    expect(manifest.exampleId).toBe('00-fixture-valid');
    expect(manifest.steps).toHaveLength(2);
  });

  it('rejects a hand-crafted invalid manifest fixture (missing field, wrong type)', () => {
    expect(() =>
      loadManifest(path.join(FIXTURES, 'invalid-manifest.json'), { requireNonHappyPath: false }),
    ).toThrow(/Invalid example manifest/);
  });

  it('rejects zero non-happy-path steps when requireNonHappyPath is true (FR-018)', () => {
    expect(() =>
      loadManifest(path.join(FIXTURES, 'zero-non-happy-path-manifest.json'), {
        requireNonHappyPath: true,
      }),
    ).toThrow(/nonHappyPath: true/);
  });

  it('accepts zero non-happy-path steps when requireNonHappyPath is false', () => {
    const manifest = loadManifest(path.join(FIXTURES, 'zero-non-happy-path-manifest.json'), {
      requireNonHappyPath: false,
    });
    expect(manifest.steps).toHaveLength(2);
  });
});
