import { inspectArtifact } from '../../../src/index';
import type {
  InspectedArtifact,
  InspectedResource,
  InspectionResult,
  InspectOptions,
} from '../../../src/index';

// T-004: compile-time proof that inspectArtifact and its types are importable
// from the package's public entry point (`src/index.ts`), matching
// `contracts/library-inspect.md`'s "Export Surface" section (AC-019, FR-003).
describe('T-004: public library surface exports inspectArtifact', () => {
  it('exposes inspectArtifact as a function', () => {
    expect(typeof inspectArtifact).toBe('function');
  });

  it('types compile: InspectedArtifact, InspectedResource, InspectionResult, InspectOptions are usable from the package root', () => {
    const options: InspectOptions = { projectRoot: '.', artifactId: 'rules/style.md' };
    const resource: InspectedResource = { relPath: 'reference.md', content: 'hi' };
    const data: InspectedArtifact = {
      id: 'rules/style.md',
      type: 'rule',
      frontmatter: {},
      body: 'Body.\n',
      bundleRoot: null,
      resources: [resource],
    };
    const result: InspectionResult = { ok: true, data };

    expect(options.artifactId).toBe('rules/style.md');
    expect(result.ok).toBe(true);
  });

  it('the inspect options type has no target-tool selection property (FR-016)', () => {
    const options: InspectOptions = { projectRoot: '.', artifactId: 'rules/style.md' };
    expect('targetId' in options).toBe(false);
    expect('registry' in options).toBe(false);
  });
});
