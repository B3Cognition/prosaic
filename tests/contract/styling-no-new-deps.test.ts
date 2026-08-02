import fs from 'fs';
import path from 'path';

// NFR-001 / AC-017: the CLI output-styling enhancement adds exactly zero (0)
// runtime dependencies beyond the existing baseline. This is a styling-scoped
// assertion, distinct from the import module's no-new-deps check
// (import-no-new-deps.json), which measures a different feature (spec 905).

const RESULTS_DIR = path.join(process.cwd(), 'test-results');
const NFR001_PATH = path.join(RESULTS_DIR, 'styling-no-new-deps-nfr001.json');

// Runtime deps present before the CLI output-styling enhancement was added.
const BASELINE_DEPS = new Set(['@iarna/toml', 'js-yaml', 'yargs', 'zod']);

// The source modules that constitute the styling enhancement. The zero-dep
// property must hold across every one of them.
const STYLING_MODULES = [
  'src/cli/style.ts',
  'src/cli/theme.ts',
  'src/cli/presentation.ts',
];

// Node builtins the styling layer is permitted to reference without adding a
// third-party dependency. (It uses none today; listed for future-proofing.)
const NODE_BUILTINS = new Set(['fs', 'path', 'os', 'util', 'process', 'tty']);

interface ModuleScan {
  module: string;
  thirdPartyImports: string[];
}

function isThirdParty(spec: string): boolean {
  if (spec.startsWith('.') || spec.startsWith('/')) return false; // intra-project
  if (spec.startsWith('node:')) return false; // explicit node builtin
  const root = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  if (NODE_BUILTINS.has(root)) return false;
  return true;
}

function scanImports(source: string): string[] {
  const specs: string[] = [];
  const importRe = /\bimport\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g;
  const requireRe = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) specs.push(m[1]);
  while ((m = requireRe.exec(source)) !== null) specs.push(m[1]);
  return specs;
}

describe('NFR-001 / AC-017: CLI output-styling adds 0 new runtime dependencies', () => {
  let addedDependencies: string[] = [];
  let addedInstalledDeps: string[] = [];
  let measuredPackageJsonPath: string;
  let measuredNodeModulesPath: string;
  let moduleScans: ModuleScan[] = [];

  beforeAll(() => {
    // Measured check 1: declared runtime deps in package.json are unchanged.
    measuredPackageJsonPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(measuredPackageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
    };
    const declaredDeps = new Set(Object.keys(pkg.dependencies ?? {}));
    addedDependencies = [...declaredDeps].filter((d) => !BASELINE_DEPS.has(d));

    // Measured check 2: installed third-party packages beyond the baseline.
    measuredNodeModulesPath = path.resolve(process.cwd(), 'node_modules');
    const installed: string[] = [];
    if (fs.existsSync(measuredNodeModulesPath)) {
      const entries = fs.readdirSync(measuredNodeModulesPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (entry.name.startsWith('.')) continue;
        if (entry.name.startsWith('@')) {
          const scopeDir = path.join(measuredNodeModulesPath, entry.name);
          try {
            for (const s of fs.readdirSync(scopeDir, { withFileTypes: true })) {
              if (s.isDirectory() || s.isSymbolicLink()) installed.push(`${entry.name}/${s.name}`);
            }
          } catch { /* ignore unreadable scope dirs */ }
        } else {
          installed.push(entry.name);
        }
      }
    }
    addedInstalledDeps = installed.filter((d) => declaredDeps.has(d) && !BASELINE_DEPS.has(d));

    // Measured check 3: styling source modules import zero third-party packages.
    moduleScans = STYLING_MODULES.map((rel) => {
      const abs = path.resolve(process.cwd(), rel);
      const source = fs.readFileSync(abs, 'utf-8');
      const thirdPartyImports = scanImports(source).filter(isThirdParty);
      return { module: rel, thirdPartyImports };
    });
  });

  afterAll(() => {
    const stylingThirdPartyImports = moduleScans.flatMap((s) => s.thirdPartyImports);
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    fs.writeFileSync(
      NFR001_PATH,
      JSON.stringify(
        {
          nfr: 'NFR-001',
          ac: 'AC-017',
          evidenceKind: 'measured_runtime',
          description:
            'CLI output-styling enhancement adds 0 new third-party runtime dependencies beyond the baseline',
          measuredPackageJsonPath,
          measuredNodeModulesPath,
          stylingModules: STYLING_MODULES,
          baselineDependencies: [...BASELINE_DEPS].sort(),
          addedDependencies,
          addedInstalledDeps,
          moduleScans,
          stylingThirdPartyImports,
          addedCount: addedDependencies.length,
          pass:
            addedDependencies.length === 0 &&
            addedInstalledDeps.length === 0 &&
            stylingThirdPartyImports.length === 0,
          measurableTarget: '0 new runtime dependencies added by the styling enhancement',
          recordedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  it('package.json declares 0 runtime dependencies beyond the baseline', () => {
    expect(addedDependencies).toHaveLength(0);
  });

  it('node_modules contains 0 new runtime deps beyond the baseline (cross-check)', () => {
    expect(addedInstalledDeps).toHaveLength(0);
  });

  it('every styling module imports 0 third-party packages', () => {
    for (const scan of moduleScans) {
      expect(scan.thirdPartyImports).toEqual([]);
    }
  });
});
