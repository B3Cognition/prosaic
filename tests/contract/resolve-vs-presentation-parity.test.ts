import * as fs from 'fs';
import * as path from 'path';
import { supports, TargetDescriptor } from '../../src/registry/descriptor';
import { builtinRegistry } from '../../src/registry/builtin';
import { translateNeutral } from '../../src/vocabulary/translator';
import { applyOverrides } from '../../src/vocabulary/override';
import { resolveExecution } from '../../src/resolve/resolve-execution';
import { REPRESENTATIVE, ALL_TYPES } from '../helpers/representative';
import { Artifact } from '../../src/domain/types';

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const ARTIFACT_PATH = path.join(RESULTS_DIR, 'resolve-presentation-parity-nfr002.json');

// ---------------------------------------------------------------------------
// Measured-runtime evidence accumulators (populated while the suite runs).
// ---------------------------------------------------------------------------
let targetsCompared = 0;
let fieldComparisons = 0;
let divergentFieldValues = 0;

/**
 * Resolved-execution field name → its underlying neutral key (mirrors
 * `resolve-execution.ts`'s FIELD_NEUTRAL_KEY, kept independent here so this
 * test does not import the implementation's own mapping constant).
 */
const FIELD_NEUTRAL_KEY = {
  model: 'capability',
  reasoningEffort: 'effort',
  tools: 'tools',
} as const;

/**
 * A representative artifact with every mapped neutral key explicitly present,
 * so `translateNeutral()`'s `dropped` list reflects "no translation rule" and
 * never "key absent from frontmatter" — the two must be distinguished for a
 * meaningful parity comparison (T-011).
 */
function withNeutralKeysSet(type: (typeof ALL_TYPES)[number]): Artifact {
  const base = REPRESENTATIVE[type];
  return {
    ...base,
    frontmatter: {
      ...base.frontmatter,
      capability: 'test-capability',
      effort: 'test-effort',
      tools: 'test-tools',
    },
  };
}

describe('T-011: resolution matches presentation\'s translateNeutral() dropped-key set (AC-008, NFR-002)', () => {
  const registry = builtinRegistry();
  const descriptors = registry.all();

  afterAll(() => {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      ARTIFACT_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-002',
          requirements: ['FR-003', 'AC-008', 'NFR-002'],
          evidenceKind: 'measured_runtime',
          description:
            'Conformance comparison run covering every registered target: resolved execution data compared ' +
            'field-by-field against the FR-003 presentation translation outcome for the same artifact-target pair.',
          targetsCompared,
          fieldComparisons,
          divergentFieldValues,
          measurableTarget: 'Exactly 0 divergent field values across a conformance comparison run covering every registered target.',
          pass: targetsCompared > 0 && fieldComparisons > 0 && divergentFieldValues === 0,
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  for (const desc of descriptors) {
    for (const type of ALL_TYPES) {
      if (!supports(desc, type)) continue;

      it(`${desc.id} · ${type}: 0 divergent field values`, () => {
        const artifact = withNeutralKeysSet(type);
        const { dropped } = translateNeutral(artifact.frontmatter, desc);
        const data = resolveExecution(artifact, desc);

        targetsCompared += 1;
        for (const [field, neutralKey] of Object.entries(FIELD_NEUTRAL_KEY) as [
          keyof typeof FIELD_NEUTRAL_KEY,
          string,
        ][]) {
          const presentationDropped = dropped.includes(neutralKey as never);
          const resolutionUnresolved = data[field].status === 'unresolved';
          fieldComparisons += 1;
          if (resolutionUnresolved !== presentationDropped) divergentFieldValues += 1;
          expect(resolutionUnresolved).toBe(presentationDropped);
        }
      });
    }
  }

  it('negative_space_coverage: conflicting neutral tools value + target override resolves to applyOverrides()\'s actual output', () => {
    const desc = descriptors.find((d: TargetDescriptor) => d.id === 'claude-code');
    expect(desc).toBeDefined();
    if (!desc) return;

    const artifact: Artifact = {
      ...REPRESENTATIVE.rule,
      frontmatter: {
        ...REPRESENTATIVE.rule.frontmatter,
        tools: 'from-neutral',
        overrides: { 'claude-code': { tools: 'from-override' } },
      },
    };

    const { concrete, dropped } = translateNeutral(artifact.frontmatter, desc);
    const overridden = applyOverrides(concrete, artifact.frontmatter, desc);
    const data = resolveExecution(artifact, desc);

    expect(dropped).not.toContain('tools');
    expect(overridden.tools).toBe('from-override');
    expect(data.tools).toEqual({ status: 'resolved', value: 'from-override' });
  });
});
