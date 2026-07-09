import * as fs from 'fs';
import * as path from 'path';
import { runPipeline } from '../../src/pipeline/runner';
import { supports, TargetDescriptor } from '../../src/registry/descriptor';
import { builtinRegistry } from '../../src/registry/builtin';
import { REPRESENTATIVE, ALL_TYPES } from '../helpers/representative';
import { clusterOf } from '../helpers/clusters';

const FIXTURE_ROOT = path.join(__dirname, '..', '..', 'conformance-fixtures');
const UPDATE = process.env.UPDATE_FIXTURES === '1';

/** All files a target produces for one representative artifact type. */
function renderFiles(desc: TargetDescriptor, type: (typeof ALL_TYPES)[number]) {
  const out = runPipeline(REPRESENTATIVE[type], desc, { lossyPolicy: 'warn' });
  return [
    { path: out.path, content: out.content },
    ...out.companions,
    ...out.resources,
  ];
}

/** Directory holding a target+type's golden files. */
function goldenDir(desc: TargetDescriptor, type: string): string {
  return path.join(FIXTURE_ROOT, clusterOf(desc.id), desc.id, type);
}

describe('per-target conformance fixtures (T-044..T-048, FR-009/AC-024/AC-025)', () => {
  const registry = builtinRegistry();
  const descriptors = registry.all();

  for (const desc of descriptors) {
    for (const type of ALL_TYPES) {
      if (!supports(desc, type)) continue;

      it(`${desc.id} · ${type} byte-matches its pinned fixture`, () => {
        const files = renderFiles(desc, type);
        const dir = goldenDir(desc, type);

        for (const file of files) {
          const goldenPath = path.join(dir, file.path);
          if (UPDATE || !fs.existsSync(goldenPath)) {
            fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
            fs.writeFileSync(goldenPath, file.content);
          }
          const golden = fs.readFileSync(goldenPath, 'utf8');
          expect(file.content).toBe(golden);
        }
      });
    }
  }
});
