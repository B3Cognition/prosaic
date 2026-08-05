import { WarningCollector } from '../../../src/domain/warnings';
import { surfaceWarnings } from '../../../src/lifecycle/warnings';

describe('package-path-rejected WarningKind (T-003, INFRA)', () => {
  it('round-trips through WarningCollector like every existing kind', () => {
    const collector = new WarningCollector();
    collector.add({
      kind: 'package-path-rejected',
      message: 'entry escapes the package source root',
      artifact: 'pkg-src/../escape',
      target: 'my-package',
    });
    expect(collector.byKind('package-path-rejected')).toHaveLength(1);
    expect(collector.format()[0]).toContain('package-path-rejected');
  });

  it('surfaceWarnings renders it without special-casing', () => {
    const lines = surfaceWarnings([
      {
        kind: 'package-path-rejected',
        message: 'entry escapes the package source root',
        artifact: 'pkg-src/../escape',
        target: 'my-package',
      },
    ]);
    expect(lines[0]).toContain('package-path-rejected');
  });
});
