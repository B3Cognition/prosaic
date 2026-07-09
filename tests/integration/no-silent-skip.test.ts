import { apply } from '../../src/lifecycle/run';
import { Registry, StaticRegistrySource } from '../../src/registry/registry';
import { skipOrLossCount, surfaceWarnings } from '../../src/lifecycle/warnings';
import { makeDescriptor } from '../helpers/descriptor-factory';
import { makeTempRoot, TempRoot } from '../helpers/temp-root';

describe('no silent skips or losses (T-035, NFR-006)', () => {
  let t: TempRoot;
  beforeEach(() => (t = makeTempRoot()));
  afterEach(() => t.cleanup());

  it('emits a warning for every skipped pair and every dropped intent', () => {
    // A skill artifact (unsupported by a command-only target) → skip warning.
    t.write('.prosaic/skills/greet/SKILL.md', '---\nname: greet\ndescription: d\neffort: high\n---\nBody\n');
    t.write('.prosaic/commands/run.md', '---\ndescription: run\neffort: high\n---\nBody\n');

    const registry = new Registry(
      new StaticRegistrySource([
        makeDescriptor({
          id: 'cmd-only',
          destinationDir: '.cmd',
          capabilities: { rule: false, skill: false, subagent: false, command: true },
          translations: {}, // cannot represent `effort` → lossy warning
        }),
      ]),
    );

    const report = apply({ projectRoot: t.root, registry });

    // The skill is skipped (unsupported) and the command drops `effort` (lossy).
    expect(report.warnings.some((w) => w.kind === 'unsupported-pair')).toBe(true);
    expect(report.warnings.some((w) => w.kind === 'lossy-intent' && w.message.includes('effort'))).toBe(true);
    expect(skipOrLossCount(report.warnings)).toBeGreaterThanOrEqual(2);

    // Every surfaced line names the artifact and/or target — no silent losses.
    for (const line of surfaceWarnings(report.warnings)) {
      expect(line).toMatch(/warning\[/);
    }
  });
});
