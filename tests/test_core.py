"""Differential inspection tests against the frozen TypeScript implementation."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

from prosaic.compat import dump_yaml, json_compatible, load_yaml
from prosaic.config import ConfigError, resolve_config
from prosaic.core import discover, inspect_artifact, parse_artifact

REFERENCE = Path(__file__).resolve().parents[1] / '.reference'


def oracle(operation, data):
    if not shutil.which('node') or not (REFERENCE / 'dist/index.js').exists():
        pytest.skip('frozen TypeScript reference unavailable')
    source = '''const fs=require("fs"),r=process.argv[1],op=process.argv[2],input=JSON.parse(fs.readFileSync(0,"utf8"));
const api={inspect:()=>require(r+"/inspect/lookup").inspectArtifact(input),
discover:()=>require(r+"/discovery/discover").discover(input.sourceRoot,input.projectRoot),
config:()=>require(r+"/config/resolve").resolveConfig(input.projectRoot,input.cli,input.globalDir).effective,
parse:()=>require(r+"/discovery/parse").parseArtifact(input),
yaml:()=>require(r+"/render/yaml").dumpYaml(input)};
try { console.log(JSON.stringify({ok:true,data:api[op]()})); } catch(e) { console.log(JSON.stringify({ok:false,message:e.message})); }'''
    result = subprocess.run(['node', '-e', source, str(REFERENCE / 'dist'), operation],
                            input=json.dumps(data), capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def write(root, relative, text):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.encode())


@pytest.mark.parametrize('raw', [
    'Plain prose\n', '\ufeffBody\r\n',
    '---\n---\n\nbody\n',
    '---\r\nname: ok\r\ndescription: yes\r\n---\r\n\r\nBody\r\n',
    '---\non: yes\noff: no\ntruth: true\nnumber: 012\noctal: 0o12\nexponent: 1e3\n---\nbody',
    '---\nbase: &a {one: 1, two: false}\ncustom: {<<: *a, one: 2}\n---\nBody',
    '---\nwhen: 2026-10-01\nnonfinite: .NaN\n---\nbody\n',
    '---\ncustom: !!set {a: null,b: null}\n---\nbody\n',
    '---\ncustom: !!omap [{a: 1},{b: 2}]\n---\nbody\n',
    '---\ncustom: !!pairs [{a: 1},{b: 2}]\n---\nbody\n',
    '---\ncustom: !!binary SGVsbG8=\n---\nbody\n',
    '---\ncustom: 9007199254740993\n---\nbody\n',
])
def test_parser_matches_ts(raw):
    expected = oracle('parse', raw)
    if not expected['ok']:
        with pytest.raises(ValueError) as error:
            parse_artifact(raw)
        assert str(error.value) == expected['message']
        return
    assert json_compatible(parse_artifact(raw)) == expected['data']


def test_discovery_bundle_invalid_source_and_symlinks(tmp_path):
    write(tmp_path, '.prosaic/rules/z.md', 'Rule\n')
    write(tmp_path, '.prosaic/rules/a.md', '---\ntype: command\n---\nbad\n')
    write(tmp_path, '.prosaic/commands/e.md', '---\nexecution: invalid\n---\nbad\n')
    write(tmp_path, '.prosaic/subagents/bad.md', '---\nname: a\n---\nbad\n')
    write(tmp_path, '.prosaic/skills/greet/SKILL.md', '---\nname: greet\ndescription: a\n---\nread docs/a.md\n')
    write(tmp_path, '.prosaic/skills/greet/docs/a.md', 'resource\r\n')
    write(tmp_path, '.prosaic/skills/greet/docs/b.py', 'ignored non-Markdown resource\n')
    write(tmp_path, '.prosaic/.prosaic-package-staging/x/rules/skip.md', 'skip')
    write(tmp_path, '.prosaic/node_modules/rules/skip.md', 'skip')
    write(tmp_path, 'outside.md', 'outside')
    (tmp_path / '.prosaic/rules/link.md').symlink_to(tmp_path / 'outside.md')
    source = tmp_path / '.prosaic'
    expected = oracle('discover', {'projectRoot': str(tmp_path), 'sourceRoot': str(source)})
    assert discover(source, tmp_path) == expected['data']
    for artifact in expected['data']['artifacts']:
        expected_inspect = oracle('inspect', {'projectRoot': str(tmp_path), 'artifactId': artifact['id']})
        assert inspect_artifact(tmp_path, artifact['id']) == expected_inspect['data']


@pytest.mark.parametrize('identifier', ['rules/missing.md', '../outside.md', '/outside.md', 'Rules/Present.md', 'rules/bad.md'])
def test_identifier_lookup_and_rejection(tmp_path, identifier):
    write(tmp_path, '.prosaic/rules/present.md', 'present\n')
    write(tmp_path, '.prosaic/rules/bad.md', '---\nname: 32\n---\nbad')
    expected = oracle('inspect', {'projectRoot': str(tmp_path), 'artifactId': identifier})
    assert inspect_artifact(tmp_path, identifier) == expected['data']


def test_config_precedence_and_explicit_empty_selection(tmp_path):
    ancestor = tmp_path / 'parent'
    root = ancestor / 'project'
    global_dir = tmp_path / 'global'
    write(global_dir, 'prosaic.config.yaml', 'source: global\nlossyPolicy: error\nbackupRetention: 4\n')
    write(ancestor, 'prosaic.config.yml', 'source: ancestor\ntargets: [cursor]\n')
    write(root, '.prosaic.yaml', 'source: project\ntargets: []\nartifactTypes: []\n')
    cli = {'source': 'cli', 'targets': ['all']}
    expected = oracle('config', {'projectRoot': str(root), 'cli': cli, 'globalDir': str(global_dir)})
    assert resolve_config(root, cli, global_dir) == expected['data']


@pytest.mark.parametrize('text', ['typo: true\n', 'backupRetention: -1\n', 'targets: null\n', 'source: 4\n',
                                'packages: [{id: a, sourceRoot: s, destinationRoot: d, extra: 1}]\n',
                                'packages: [{id: a, sourceRoot: s, destinationRoot: d}, {id: a, sourceRoot: s, destinationRoot: d}]\n'])
def test_config_rejection_message(tmp_path, text):
    write(tmp_path, 'prosaic.config.yaml', text)
    expected = oracle('config', {'projectRoot': str(tmp_path)})
    with pytest.raises(ConfigError) as error:
        resolve_config(tmp_path)
    assert str(error.value) == expected['message']


@pytest.mark.parametrize('text', ['artifactTypes: [null]', 'artifactTypes: [1]', 'artifactTypes: [{}]',
                                'lossyPolicy: null', 'lossyPolicy: false',
                                'z: 1\npackages: [{id: a,sourceRoot: s,destinationRoot: d,x: 2}]'])
def test_strict_config_diagnostics(tmp_path,text):
    write(tmp_path, 'prosaic.config.yaml',text)
    expected=oracle('config',{'projectRoot':str(tmp_path)})
    with pytest.raises(ConfigError) as error:
        resolve_config(tmp_path)
    assert str(error.value)==expected['message']


@pytest.mark.parametrize('value', ['-.5','+.5','1_','1__2','0b_1','0o_7','0x_F','1_e2','1._2','1_.2',
                                  '+.nan','-.nan','0_1','1.0_e3','0b_','0x_','0o_','1e999','9'*350,'.'])
def test_js_yaml_numeric_resolution(value):
    raw='---\ncustom: '+value+'\n---\nbody'
    expected=oracle('parse',raw)
    assert json_compatible(parse_artifact(raw))==expected['data']


@pytest.mark.parametrize('data', [
    {'description': 'yes', 'truth': 'true', 'a': '012', 'version': '1.0.0'},
    {'name': 'a', 'description': 'a: b', 'custom': {'yes': 'no', 'array': ['a', 'b', 3, True, None]}},
    {'body': 'line 1\nline 2\n', 'one': 'no newline\nline 2', 'three': 'a\n\n'},
    {'description': '"quoted"', 'body': 'multi\nline\n', 'a': ' #x ', 'bang': '!no', 'date': '2026-10-01'},
    {'small': 1e-7, 'huge': 1e20, 'zero': -0.0, 'smaller': 1e-6, 'larger':1e21, 'largest':1e100},
])
def test_yaml_output_bytes(data):
    assert dump_yaml(data) == oracle('yaml', data)['data']


@pytest.mark.parametrize('text', ['custom: !!set {a: null,b: null}', 'custom: !!omap [{a: 1},{b: 2}]',
                                'custom: !!binary SGVsbG8=', 'custom: 2026-10-01', 'custom: 9007199254740993'])
def test_admitted_yaml_types_render_as_reference(text):
    parsed = parse_artifact('---\n' + text + '\n---\nbody')
    # Oracle retains Date and Uint8Array from its own YAML parser for rendering.
    source = 'const y=require(process.argv[1]+"/../node_modules/js-yaml");console.log(JSON.stringify(require(process.argv[1]+"/render/yaml").dumpYaml(y.load(process.argv[2]))))'
    result = subprocess.run(['node', '-e', source, str(REFERENCE / 'dist'), text], capture_output=True, text=True, check=True)
    assert dump_yaml(parsed['frontmatter']) == json.loads(result.stdout)


def test_unicode_collation_matches_node():
    from prosaic.compat import js_sort_key
    values = ['_a', '-a', '.a', 'a_b', 'a-b', 'a.b', 'A', 'a', 'ä', 'á', 'é', 'e', 'É', '10', '2', 'β', '😀', 'z']
    result = subprocess.run(['node', '-e', 'console.log(JSON.stringify(JSON.parse(process.argv[1]).sort((a,b)=>a.localeCompare(b))))', json.dumps(values)], capture_output=True, text=True, check=True)
    assert sorted(values, key=js_sort_key) == json.loads(result.stdout)


def test_consumer_prose_inspection():
    for project in ('prosaic-runtime', 'prosaic-harness'):
        root = Path(__file__).resolve().parents[2] / project / 'examples'
        source = root / '.prosaic'
        if not source.exists():
            continue
        for artifact in discover(source, root)['artifacts']:
            expected = oracle('inspect', {'projectRoot': str(root), 'artifactId': artifact['id']})
            assert json_compatible(inspect_artifact(root, artifact['id'])) == expected['data']
