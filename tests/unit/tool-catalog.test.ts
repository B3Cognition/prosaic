import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { runCli } from '../helpers/run-cli';

const manifest = {
  schema_version: 1, name: 'analyze_spec', tool_version: '1.0', description: 'Analyze a spec',
  executable: 'spec-analyzer', argv: ['{spec}', '--json'],
  parameters: { type: 'object', additionalProperties: false, required: ['spec'], properties: { spec: { type: 'string' } } },
  path_parameters: { spec: 'read' }, version_probe: ['--version'], output_format: 'json', timeout_s: 30, max_output_bytes: 65536,
};

describe('read-only CLI tool catalogue', () => {
  let root: string;
  let tools: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'prosaic-tools-')); tools = path.join(root, '.prosaic', 'tools'); fs.mkdirSync(tools, { recursive: true }); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('discovers sorted YAML and YML manifests without needing executables', () => {
    fs.writeFileSync(path.join(tools, 'z.yml'), yaml.dump(manifest));
    fs.writeFileSync(path.join(tools, 'a.yaml'), yaml.dump({ ...manifest, name: 'other' }));
    const result = runCli(root, ['tools', '--source', '.prosaic']);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.tools.map((t: any) => t.manifest.name)).toEqual(['other', 'analyze_spec']);
    expect(report.tools[1].manifest.parameters.required).toEqual(['spec']);
    expect(result.stderr).toBe('');
  });

  test.each([
    { unexpected: true }, { schema_version: true }, { executable: '{spec}' },
    { argv: ['--spec={spec}'] }, { argv: ['{unknown}'] }, { path_parameters: { other: 'read' } },
    { parameters: { type: 'object' } }, { timeout_s: 0 },
  ])('rejects invalid tool contracts %j', (change) => {
    fs.writeFileSync(path.join(tools, 'bad.yml'), yaml.dump({ ...manifest, ...change }));
    const result = runCli(root, ['tools', '--source', '.prosaic']);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('manifest');
  });

  test('rejects duplicate names and symlinked manifests', () => {
    const file = path.join(tools, 'one.yml'); fs.writeFileSync(file, yaml.dump(manifest));
    fs.writeFileSync(path.join(tools, 'two.yml'), yaml.dump(manifest));
    expect(runCli(root, ['tools', '--source', '.prosaic']).status).not.toBe(0);
    fs.unlinkSync(path.join(tools, 'two.yml'));
    fs.symlinkSync(file, path.join(tools, 'two.yml'));
    const result = runCli(root, ['tools', '--source', '.prosaic']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('manifest');
  });

  test('missing tools directory is an empty catalogue, not execution or installation', () => {
    fs.rmdirSync(tools);
    const result = runCli(root, ['tools', '--source', '.prosaic']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).tools).toEqual([]);
  });
});
